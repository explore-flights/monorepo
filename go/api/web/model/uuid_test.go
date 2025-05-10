package model

import (
	"encoding/json"
	"github.com/gofrs/uuid/v5"
	"github.com/stretchr/testify/assert"
	"testing"
)

func TestUUID_MarshalJSON(t *testing.T) {
	base, err := uuid.FromString("2f72e128-4c63-4a61-b644-f2681d268a94")
	if !assert.NoError(t, err) {
		return
	}

	u := UUID(base)
	b, err := json.Marshal(u)
	if !assert.NoError(t, err) {
		return
	}

	assert.Equal(t, `"UqoJdgm8EZbYKNGToEucvA"`, string(b))
}

func TestUUID_UnmarshalJSON(t *testing.T) {
	var u UUID
	if !assert.NoError(t, json.Unmarshal([]byte(`"UqoJdgm8EZbYKNGToEucvA"`), &u)) {
		return
	}

	assert.Equal(t, "2f72e128-4c63-4a61-b644-f2681d268a94", uuid.UUID(u).String())
}
