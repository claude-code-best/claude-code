# Session: vLLM Inference Optimization
- Level: Beginner (Target: Inference Optimization)
- Started: 2026-04-24
- Status: Mastered

## Concepts
1. ✅ LLM 推理的两个阶段 (Prefill vs Decode)
2. ✅ KV Cache
3. ✅ 显存瓶颈与碎片化
4. ✅ PagedAttention
5. ✅ vLLM 架构 (Scheduler, Worker)
6. ✅ 实战部署 (--dtype, openai api)
7. ✅ 量化 (AWQ/GPTQ vs 暴力 dtype)
8. ✅ Tensor Parallel (TP, NCCL)
9. ✅ 性能参数 (--gpu-memory-utilization)
10. ✅ Chunked Prefill

## Misconceptions
- [Chunked Prefill]: 原以为主要目的是降低显存。
  - 纠正：确实降低了**峰值激活显存**，但核心目的是降低**Latency (卡顿感)**。

## Log
- Diagnosed: Beginner
- Mastery: Intuitive understanding of memory constraints and fragmentation is strong.
- Final Quiz: 3/3 correct (with minor clarification needed on TP params).
