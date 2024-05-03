export interface Subscribable<T> {
  map<E>(mapper: (v: T) => E): Subscribable<E>;
  withPrevious(): Subscribable<{ prev?: T, value: T }>;
  subscribe(handler: (v: T) => void): Subscription;
}

export interface Subscription {
  combine(other: Subscription): Subscription;
  unsubscribe(): void;
  get unsubscribeFunc(): () => void;
}

export interface Subject<T> {
  next(value: T): void;
}

class RootSubscription<T> implements Subscription {
  constructor(private readonly handler: (v: T) => void, private readonly _unsubscribeFunc: (self: RootSubscription<T>) => void) {
  }

  next(value: T): void {
    this.handler(value);
  }

  combine(other: Subscription): Subscription {
    return new CombinedSubscription(this, other);
  }

  unsubscribe(): void {
    this._unsubscribeFunc(this);
  }

  get unsubscribeFunc(): () => void {
    return this.unsubscribe.bind(this);
  }
}

class CombinedSubscription implements Subscription {
  constructor(private readonly first: Subscription, private readonly second: Subscription) {
  }

  combine(other: Subscription): Subscription {
    return new CombinedSubscription(this, other);
  }

  unsubscribe(): void {
    this.first.unsubscribe();
    this.second.unsubscribe();
  }

  get unsubscribeFunc(): () => void {
    return this.unsubscribe.bind(this);
  }
}

interface InternalSubscribable<T> extends Subscribable<T> {
  getLatestValue(): T | undefined;
}

class MappingSubscribable<IN, OUT> implements InternalSubscribable<OUT> {
  constructor(private readonly parent: InternalSubscribable<IN>, private readonly mapper: (v: IN) => OUT) {

  }

  map<E>(mapper: (v: OUT) => E): Subscribable<E> {
    return new MappingSubscribable(this, mapper);
  }

  withPrevious(): Subscribable<{ prev?: OUT; value: OUT }> {
    const getLatestValue = this.getLatestValue.bind(this);
    return this.map((v) => ({ prev: getLatestValue(), value: v }));
  }

  subscribe(handler: (v: OUT) => void): Subscription {
    const { mapper } = this;
    return this.parent.subscribe((v) => handler(mapper(v)));
  }

  getLatestValue(): OUT | undefined {
    const parentLatest = this.parent.getLatestValue();
    if (parentLatest === undefined) {
      return undefined;
    }

    return this.mapper(parentLatest);
  }
}

export class SubscribableSubject<T> implements InternalSubscribable<T>, Subject<T> {
  private readonly subscriptions: Array<RootSubscription<T>>;
  private latestValue?: T;

  constructor(initialValue?: T) {
    this.subscriptions = [];
    this.latestValue = initialValue;
  }

  map<E>(mapper: (v: T) => E): Subscribable<E> {
    return new MappingSubscribable(this, mapper);
  }

  withPrevious(): Subscribable<{ prev?: T; value: T }> {
    const getLatestValue = this.getLatestValue.bind(this);
    return this.map((v) => ({ prev: getLatestValue(), value: v }));
  }

  subscribe(handler: (v: T) => void): Subscription {
    const subscription = new RootSubscription<T>(handler, this.unsubscribe.bind(this));
    this.subscriptions.push(subscription);

    if (this.latestValue !== undefined) {
      handler(this.latestValue);
    }

    return subscription;
  }

  getLatestValue(): T | undefined {
    return this.latestValue;
  }

  private unsubscribe(subscription: RootSubscription<T>): void {
    const index = this.subscriptions.indexOf(subscription);
    if (index !== -1) {
      this.subscriptions.splice(index, 1);
    }
  }

  next(value: T): void {
    this.latestValue = value;

    for (const subscription of this.subscriptions) {
      subscription.next(value);
    }
  }
}
