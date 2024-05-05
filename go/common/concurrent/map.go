package concurrent

import "sync"

type Map[K comparable, V any] struct {
	m   map[K]V
	mtx *sync.RWMutex
}

func NewMap[K comparable, V any]() Map[K, V] {
	return Map[K, V]{
		m:   make(map[K]V),
		mtx: new(sync.RWMutex),
	}
}

func (cm Map[K, V]) Load(k K) (V, bool) {
	cm.mtx.RLock()
	defer cm.mtx.RUnlock()

	v, ok := cm.m[k]

	return v, ok
}

func (cm Map[K, V]) Store(k K, v V) {
	cm.mtx.Lock()
	defer cm.mtx.Unlock()

	cm.m[k] = v
}

func (cm Map[K, V]) Delete(k K) {
	cm.mtx.Lock()
	defer cm.mtx.Unlock()

	delete(cm.m, k)
}

func (cm Map[K, V]) LoadAndDelete(k K) (V, bool) {
	cm.mtx.Lock()
	defer cm.mtx.Unlock()

	v, ok := cm.m[k]
	delete(cm.m, k)

	return v, ok
}

func (cm Map[K, V]) LoadOrStore(k K, v V) (V, bool) {
	cm.mtx.Lock()
	defer cm.mtx.Unlock()

	if v, ok := cm.m[k]; ok {
		return v, true
	}

	cm.m[k] = v
	return v, false
}

func (cm Map[K, V]) Swap(k K, v V) (V, bool) {
	cm.mtx.Lock()
	defer cm.mtx.Unlock()

	prevV, ok := cm.m[k]
	cm.m[k] = v

	return prevV, ok
}

func (cm Map[K, V]) Range(f func(k K, v V) bool) {
	cm.mtx.RLock()
	defer cm.mtx.RUnlock()

	for k, v := range cm.m {
		if !f(k, v) {
			break
		}
	}
}
