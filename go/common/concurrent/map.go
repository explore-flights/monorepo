package concurrent

import "sync"

type RMap[K comparable, V any] interface {
	Load(k K) (V, bool)
	Range(f func(k K, v V) bool)
	RLocked(f func(m RMap[K, V]))
}

type WMap[K comparable, V any] interface {
	Store(k K, v V)
	Delete(k K)
	LoadAndDelete(k K) (V, bool)
	LoadOrStore(k K, v V) (V, bool)
	Swap(k K, v V) (V, bool)
	WLocked(f func(m WMap[K, V]))
	Locked(f func(m RWMap[K, V]))
}

type RWMap[K comparable, V any] interface {
	RMap[K, V]
	WMap[K, V]
}

// region Map

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
	return cm.unsafeLoad(k)
}

func (cm Map[K, V]) unsafeLoad(k K) (V, bool) {
	v, ok := cm.m[k]
	return v, ok
}

func (cm Map[K, V]) Store(k K, v V) {
	cm.mtx.Lock()
	defer cm.mtx.Unlock()
	cm.unsafeStore(k, v)
}

func (cm Map[K, V]) unsafeStore(k K, v V) {
	cm.m[k] = v
}

func (cm Map[K, V]) Delete(k K) {
	cm.mtx.Lock()
	defer cm.mtx.Unlock()
	cm.unsafeDelete(k)
}

func (cm Map[K, V]) unsafeDelete(k K) {
	delete(cm.m, k)
}

func (cm Map[K, V]) LoadAndDelete(k K) (V, bool) {
	cm.mtx.Lock()
	defer cm.mtx.Unlock()
	return cm.unsafeLoadAndDelete(k)
}

func (cm Map[K, V]) unsafeLoadAndDelete(k K) (V, bool) {
	v, ok := cm.m[k]
	delete(cm.m, k)

	return v, ok
}

func (cm Map[K, V]) LoadOrStore(k K, v V) (V, bool) {
	cm.mtx.Lock()
	defer cm.mtx.Unlock()
	return cm.unsafeLoadOrStore(k, v)
}

func (cm Map[K, V]) unsafeLoadOrStore(k K, v V) (V, bool) {
	if v, ok := cm.m[k]; ok {
		return v, true
	}

	cm.m[k] = v
	return v, false
}

func (cm Map[K, V]) Swap(k K, v V) (V, bool) {
	cm.mtx.Lock()
	defer cm.mtx.Unlock()
	return cm.unsafeSwap(k, v)
}

func (cm Map[K, V]) unsafeSwap(k K, v V) (V, bool) {
	prevV, ok := cm.m[k]
	cm.m[k] = v

	return prevV, ok
}

func (cm Map[K, V]) Range(f func(k K, v V) bool) {
	cm.mtx.RLock()
	defer cm.mtx.RUnlock()
	cm.unsafeRange(f)
}

func (cm Map[K, V]) unsafeRange(f func(k K, v V) bool) {
	for k, v := range cm.m {
		if !f(k, v) {
			break
		}
	}
}

func (cm Map[K, V]) RLocked(f func(m RMap[K, V])) {
	cm.mtx.RLock()
	defer cm.mtx.RUnlock()
	f(rMapProxy[K, V](cm))
}

func (cm Map[K, V]) WLocked(f func(m WMap[K, V])) {
	cm.mtx.RLock()
	defer cm.mtx.RUnlock()
	f(rwMapProxy[K, V](cm))
}

func (cm Map[K, V]) Locked(f func(m RWMap[K, V])) {
	cm.mtx.Lock()
	defer cm.mtx.Unlock()
	f(rwMapProxy[K, V](cm))
}

// endregion
// region RMap Proxy

type rMapProxy[K comparable, V any] Map[K, V]

func (mp rMapProxy[K, V]) Load(k K) (V, bool) {
	return Map[K, V](mp).unsafeLoad(k)
}

func (mp rMapProxy[K, V]) Range(f func(k K, v V) bool) {
	Map[K, V](mp).unsafeRange(f)
}

func (mp rMapProxy[K, V]) RLocked(f func(m RMap[K, V])) {
	f(mp)
}

// endregion
// region RWMap Proxy

type rwMapProxy[K comparable, V any] Map[K, V]

func (mp rwMapProxy[K, V]) Load(k K) (V, bool) {
	return Map[K, V](mp).unsafeLoad(k)
}

func (mp rwMapProxy[K, V]) Range(f func(k K, v V) bool) {
	Map[K, V](mp).unsafeRange(f)
}

func (mp rwMapProxy[K, V]) RLocked(f func(m RMap[K, V])) {
	f(mp)
}

func (mp rwMapProxy[K, V]) Store(k K, v V) {
	Map[K, V](mp).unsafeStore(k, v)
}

func (mp rwMapProxy[K, V]) Delete(k K) {
	Map[K, V](mp).unsafeDelete(k)
}

func (mp rwMapProxy[K, V]) LoadAndDelete(k K) (V, bool) {
	return Map[K, V](mp).unsafeLoadAndDelete(k)
}

func (mp rwMapProxy[K, V]) LoadOrStore(k K, v V) (V, bool) {
	return Map[K, V](mp).unsafeLoadOrStore(k, v)
}

func (mp rwMapProxy[K, V]) Swap(k K, v V) (V, bool) {
	return Map[K, V](mp).unsafeSwap(k, v)
}

func (mp rwMapProxy[K, V]) WLocked(f func(m WMap[K, V])) {
	f(mp)
}

func (mp rwMapProxy[K, V]) Locked(f func(m RWMap[K, V])) {
	f(mp)
}

// endregion

// type assertions
var _ RWMap[int, any] = (*Map[int, any])(nil)
var _ RMap[int, any] = (*rMapProxy[int, any])(nil)
var _ RWMap[int, any] = (*rwMapProxy[int, any])(nil)
