package model

import (
	"encoding/json"
	"github.com/gofrs/uuid/v5"
	"github.com/jxskiss/base62"
)

type UUID uuid.UUID

func (u UUID) MarshalJSON() ([]byte, error) {
	return json.Marshal(u.String())
}

func (u *UUID) UnmarshalJSON(b []byte) error {
	var s string
	if err := json.Unmarshal(b, &s); err != nil {
		return err
	}

	return u.FromString(s)
}

func (u UUID) String() string {
	return base62.EncodeToString(u[:])
}

func (u *UUID) FromString(s string) error {
	r, err := base62.DecodeString(s)
	if err != nil {
		return err
	}

	base, err := uuid.FromBytes(r)
	if err != nil {
		return err
	}

	*u = UUID(base)
	return nil
}
