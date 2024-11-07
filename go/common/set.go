package common

import "encoding/json"

type Set[T comparable] map[T]struct{}

func (s *Set[T]) UnmarshalJSON(bytes []byte) error {
	var values []T
	if err := json.Unmarshal(bytes, &values); err != nil {
		return err
	}

	r := make(map[T]struct{}, len(values))
	for _, value := range values {
		r[value] = struct{}{}
	}

	*s = r

	return nil
}

func (s Set[T]) MarshalJSON() ([]byte, error) {
	values := make([]T, 0, len(s))
	for value := range s {
		values = append(values, value)
	}

	return json.Marshal(values)
}

func (s Set[T]) Contains(value T) bool {
	_, ok := s[value]
	return ok
}

func (s Set[T]) Remove(value T) bool {
	_, ok := s[value]
	delete(s, value)
	return ok
}
