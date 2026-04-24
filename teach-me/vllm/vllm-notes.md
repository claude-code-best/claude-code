
# vLLM 核心原理与性能调优笔记

## 1. vLLM 是什么？
一个**高吞吐量、低延迟**的大语言模型推理服务框架。
* **核心目标**：榨干 GPU 性能，让同一个显卡能同时服务更多并发请求（Throughput），并减少卡顿（Latency）。
* **一句话理解**：LLM 推理版的"显存管理大师与调度大师"。

---

## 2. 为什么 vLLM 快？(核心原理)

### 2.1 显存的痛点：KV Cache 与 显存碎片化
LLM 推理分为两个阶段：
1. **Prefill (预填)**：处理 Prompt，生成第一个 token。
2. **Decode (解码)**：基于之前的 token，一个接一个地生成下一个 token。
* **KV Cache**：为了避免每次 Decode 都重新计算一遍之前所有 token 的 Attention，必须把这些中间结果 (KV) 存在 GPU 显存里。
* **传统框架痛点**：一次申请固定长度的连续显存。如果一个请求用了 50% 的空间就结束，剩下的显存因为"不连续"而无法分给其他请求，导致显存利用率只有 20% 左右（**显存碎片化**）。

### 2.2 PagedAttention (分页存储技术 —— vLLM 的大杀器)
借鉴了操作系统**虚拟内存分页**的设计。
* **做法**：不再一次性分配一大块显存，而是把 KV Cache 切分成固定大小的 **Block**。每个 Block 存在显存的任意位置，通过 **Block Table** 映射。
* **效果**：空闲的 Block 随时分配给新请求。显存利用率从 20% 提升到 90%+。
* **好处**：彻底解决了碎片化问题，使 Concurrent Batching 成为可能。

### 2.3 Continuous Batching (连续批处理)
* **Static Batching (传统)**：一个 Batch 里的请求必须一起跑。哪怕 9 个请求生成了 10 个 token 就结束了，必须等第 10 个请求生成完（比如 500 个 token）才能结束。这导致 GPU 在后期大量空转。
* **Continuous Batching**：一个请求一旦结束，立刻从 Batch 中剔除，并从队列里拉一个新请求塞进去。GPU 始终在满负荷工作，**吞吐量呈指数级提升**。

---

## 3. 性能与显存进阶优化

### 3.1 量化 (Quantization)
把高精度的权重（如 FP16）压缩成低精度的版本（如 INT8, INT4, FP8）。
* **作用**：**减少显存占用（装下更大的模型）；提高推理速度（低精度计算更快）**。
* **AWQ / GPTQ vs 暴力降低精度**：
    * 模型中有极少数关键权重 (**Outliers/异常值**)。如果暴力降低精度，这部分信息丢失，模型性能（IQ）会暴跌。
    * **AWQ 等算法**会先探测哪些权重敏感，针对这些权重特殊保护（保留更高精度），其余部分暴力压缩。类似于“好钢用在刀刃上”。

### 3.2 多卡并行 (Tensor Parallelism - TP)
当模型太大，单张显卡（如 A100 80G）装不下（比如 70B FP16 需要 140G 显存）：
* **做法**：把模型的每一层权重矩阵切分成 N 份（N = GPU 数），分配给多张卡。每执行一步，各卡算好自己那份，再通过 **NCCL 协议** 在 GPU 之间交换中间结果并合并。
* **代价**：**通信带宽瓶颈**。如果模型不大，切分后的通信延迟会抵消计算带来的速度提升。

### 3.4 分块预填 (Chunked Prefill)
* **背景**：在 Continuous Batching 中，如果一个巨大 Prompt (100k) 进来，它的 Prefill 计算量极其庞大，可能会导致其他小请求被阻塞（卡顿）。
* **做法**：把大 Prompt 的 Prefill 阶段切成小块，穿插在小请求的 Decode 阶段之间执行。
* **效果**：大幅降低**Latency（卡顿感）**，并降低 Prefill 的**峰值显存占用**，允许调度更多并发请求。

### 3.5 其他关键优化
* **Prefix Caching (前缀缓存)**：如果应用有大量重复的 System Prompt（比如 500 tokens 的角色设定），可以直接复用之前的 KV Cache，不用重新计算。
* **Stream Processing (流式处理)**：不用等全部生成完才返回，算出几个 token 就返回给用户，降低“首字延迟” (TTFT)。

---

## 4. 实战参数大全 (Cheat Sheet)

```bash
# 1. 加载 70B 模型，4 张 A100-80G
# 使用 4 卡切分 (TP=4)，自动选择精度 (通常是 FP16)
# 最大支持 8k 上下文
# 使用 PagedAttention 优化显存 (默认开启)
vllm serve Qwen/Qwen2.5-70B-Instruct \
  --tensor-parallel-size 4 \
  --dtype auto \
  --max-model-len 8192 \
  --gpu-memory-utilization 0.95

# 2. 量化加载 (如果只有一张卡，想用 INT4 加载 70B)
# (需要模型支持 AWQ 格式文件)
vllm serve Qwen/Qwen2.5-70B-Instruct-AWQ \
  --quantization awq
```

| 参数 | 作用 | 调优建议 |
|------|------|----------|
| `--tensor-parallel-size N` | 多卡切分 (TP) | 大模型 (30B+) 才用。卡越多，通信越慢，单请求延迟越高，但吞吐量越高。 |
| `--max-model-len N` | 最大上下文长度 | **越小越好**。显存省得越多，并发请求量 (Batch Size) 越大。按需设置 (如 4096)。 |
| `--gpu-memory-utilization` | 显存利用率阈值 | 建议 `0.90` 或 `0.95`。留一些余量给 Activation (激活值) 避免 OOM 崩溃。 |
| `--enable-prefix-caching` | 开启前缀缓存 | Agentic 场景 / Long context 场景推荐开启。大幅降低重复 Prompt 的计算时间。 |
