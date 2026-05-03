/**
 * 在数组元素之间插入分隔元素，生成一个新数组。
 *
 * @template A - 数组元素类型
 * @param as - 原始数组
 * @param separator - 分隔元素生成函数，根据当前索引返回要插入的值
 * @returns 插入分隔元素后的新数组
 *
 * @example
 * // 插入固定分隔符
 * intersperse([1, 2, 3], () => 0)
 * // => [1, 0, 2, 0, 3]
 *
 * @example
 * // 分隔符依赖索引
 * intersperse(['a', 'b', 'c'], i => `-${i}-`)
 * // => ['a', '-1-', 'b', '-2-', 'c']
 *
 * @description
 * 实现细节：
 * - 使用 `flatMap` 遍历数组
 * - 第一个元素（i === 0）直接返回 `[a]`
 * - 其余元素在前面插入 `separator(i)`，返回 `[separator(i), a]`
 * - `flatMap` 会自动将这些小数组拍平成一个结果数组
 *
 * 等价逻辑：
 * [
 *   as[0],
 *   separator(1), as[1],
 *   separator(2), as[2],
 *   ...
 * ]
 */
export function intersperse<A>(as: A[], separator: (index: number) => A): A[] {
  return as.flatMap((a, i) => (i ? [separator(i), a] : [a]))
}

/**
 * 统计数组中满足条件的元素个数。
 *
 * @template T - 数组元素的类型
 * @param arr - 只读数组（不会被修改）
 * @param pred - 判断函数，对每个元素执行，返回 truthy / falsy 值
 * @returns 满足条件的元素数量
 *
 * @example
 * count([1, 2, 3, 4], x => x % 2 === 0) // 2
 *
 * @description
 * 实现细节：
 * - pred(x) 返回任意值（unknown），通过 `!!` 转为布尔值
 * - 再通过一元 `+` 将布尔值转为数字（true → 1, false → 0）
 * - 累加得到总数
 */
export function count<T>(arr: readonly T[], pred: (x: T) => unknown): number {
  let n = 0
  for (const x of arr) n += +!!pred(x)
  return n
}

/**
 * 对可迭代对象进行去重，返回去重后的数组。
 *
 * @template T - 元素类型
 * @param xs - 任意可迭代对象（如数组、Set、Map 的键等）
 * @returns 去重后的数组（保留原始插入顺序）
 *
 * @example
 * uniq([1, 2, 2, 3]) // [1, 2, 3]
 *
 * @description
 * 实现细节：
 * - 使用 ES6 的 Set 自动去重
 * - Set 会保留元素的插入顺序
 * - 再通过扩展运算符 `...` 转回数组
 */
export function uniq<T>(xs: Iterable<T>): T[] {
  return [...new Set(xs)]
}
