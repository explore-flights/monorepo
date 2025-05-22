declare const __brand: unique symbol;
type Brand<B> = { [__brand]: B };

export type Branded<T, B> = T & Brand<B>;

type WithRequired<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;