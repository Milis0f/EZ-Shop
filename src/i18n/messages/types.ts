/**
 * The shape of a dictionary: same keys and nesting as the English source, every leaf a string.
 * The English object is written `as const`; French and Spanish are annotated with this shape, so a
 * missing key, an extra key or a wrong nesting is a type error (and the parity test catches it too).
 */
export type DeepStringShape<T> = {
  readonly [K in keyof T]: T[K] extends string ? string : DeepStringShape<T[K]>;
};
