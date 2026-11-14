package model

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jxskiss/base62"
)

// ConnectionsContinuation is encoded as Unix milliseconds (8 bytes), followed by
// the number consumed at that timestamp (4 bytes), both in big-endian order.
type ConnectionsContinuation struct {
	Departure time.Time
	Consumed  uint32
}

func (c ConnectionsContinuation) String() string {
	var data [12]byte
	binary.BigEndian.PutUint64(data[:8], uint64(c.Departure.UnixMilli()))
	binary.BigEndian.PutUint32(data[8:], c.Consumed)
	return base62.EncodeToString(data[:])
}

func (c *ConnectionsContinuation) FromString(token string) error {
	if len(token) > 32 {
		return fmt.Errorf("invalid continuation token")
	}
	data, err := base62.DecodeString(token)
	if err != nil || len(data) != 12 || base62.EncodeToString(data) != token {
		return fmt.Errorf("invalid continuation token")
	}
	*c = ConnectionsContinuation{
		Departure: time.UnixMilli(int64(binary.BigEndian.Uint64(data[:8]))).UTC(),
		Consumed:  binary.BigEndian.Uint32(data[8:]),
	}
	return nil
}

func (c ConnectionsContinuation) MarshalJSON() ([]byte, error) {
	return json.Marshal(c.String())
}

func (c *ConnectionsContinuation) UnmarshalJSON(data []byte) error {
	var token string
	if err := json.Unmarshal(data, &token); err != nil {
		return err
	}
	return c.FromString(token)
}

func (c ConnectionsContinuation) MarshalText() ([]byte, error) {
	return []byte(c.String()), nil
}

func (c *ConnectionsContinuation) UnmarshalText(data []byte) error {
	return c.FromString(string(data))
}
