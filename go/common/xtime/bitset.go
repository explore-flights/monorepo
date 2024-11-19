package xtime

import (
	"encoding/base64"
	"encoding/json"
	"math/big"
)

type b64EncodedBigInt big.Int

func (b *b64EncodedBigInt) UnmarshalText(text []byte) error {
	bytes, err := base64.RawURLEncoding.AppendDecode(make([]byte, 0), text)
	if err != nil {
		return err
	}

	*b = b64EncodedBigInt(*new(big.Int).SetBytes(bytes))

	return nil
}

func (b b64EncodedBigInt) MarshalText() ([]byte, error) {
	return base64.RawURLEncoding.AppendEncode(make([]byte, 0), (*big.Int)(&b).Bytes()), nil
}

type LocalDateBitSet struct {
	offset LocalDate
	bitset big.Int
}

func (bs *LocalDateBitSet) UnmarshalJSON(b []byte) error {
	var temp struct {
		Offset LocalDate        `json:"offset"`
		Bitset b64EncodedBigInt `json:"bitset"`
	}

	if err := json.Unmarshal(b, &temp); err != nil {
		return err
	}

	bs.offset = temp.Offset
	bs.bitset = big.Int(temp.Bitset)
	return nil
}

func (bs LocalDateBitSet) MarshalJSON() ([]byte, error) {
	return json.Marshal(struct {
		Offset LocalDate        `json:"offset"`
		Bitset b64EncodedBigInt `json:"bitset"`
	}{
		Offset: bs.offset,
		Bitset: b64EncodedBigInt(bs.bitset),
	})
}

func (bs LocalDateBitSet) Iter(yield func(LocalDate) bool) {
	var zero big.Int

	currD := bs.offset
	currBs := new(big.Int).Set(&bs.bitset)

	for currBs.Cmp(&zero) != 0 {
		gap := currBs.TrailingZeroBits()
		currD += LocalDate(gap)

		if !yield(currD) {
			return
		}

		currBs.Rsh(currBs, gap+1)
		currD += 1
	}
}

func (bs LocalDateBitSet) Compact() LocalDateBitSet {
	gap := bs.bitset.TrailingZeroBits()
	if gap == 0 {
		return bs
	}

	bs.offset += LocalDate(gap)
	bs.bitset = *new(big.Int).Set(&bs.bitset)
	bs.bitset.Rsh(&bs.bitset, gap)

	return bs
}

func (bs LocalDateBitSet) Add(d LocalDate) LocalDateBitSet {
	index := bs.offset.DaysUntil(d)
	bs.bitset = *new(big.Int).Set(&bs.bitset)

	if index >= 0 {
		bs.bitset.SetBit(&bs.bitset, index, 1)
	} else {
		bs.offset = d
		bs.bitset.Lsh(&bs.bitset, uint(-index))
		bs.bitset.SetBit(&bs.bitset, 0, 1)
	}

	return bs
}

func (bs LocalDateBitSet) Remove(d LocalDate) LocalDateBitSet {
	index := bs.offset.DaysUntil(d)
	if index < 0 {
		return bs
	}

	bs.bitset = *new(big.Int).Set(&bs.bitset)
	bs.bitset.SetBit(&bs.bitset, index, 0)

	return bs
}

func (bs LocalDateBitSet) Or(other LocalDateBitSet) LocalDateBitSet {
	gap := bs.offset.DaysUntil(other.offset)
	if gap < 0 {
		gap = -gap
		bs, other = other, bs
	}

	aligned := new(big.Int).Set(&other.bitset)
	aligned.Lsh(aligned, uint(gap))

	bs.bitset = *new(big.Int).Set(&bs.bitset)
	bs.bitset.Or(&bs.bitset, aligned)

	return bs
}

func (bs LocalDateBitSet) Contains(d LocalDate) bool {
	index := bs.offset.DaysUntil(d)
	if index < 0 {
		return false
	}

	return bs.bitset.Bit(index) > 0
}

func (bs LocalDateBitSet) Span() (LocalDateRange, bool) {
	firstIndex := int(bs.bitset.TrailingZeroBits())
	lastIndex := bs.bitset.BitLen()

	if lastIndex < 1 {
		return LocalDateRange{}, false
	}

	return LocalDateRange{
		bs.offset + LocalDate(firstIndex),
		bs.offset + LocalDate(lastIndex-1),
	}, true
}

func (bs LocalDateBitSet) Count() int {
	cnt := 0
	for i := 0; i < bs.bitset.BitLen(); i++ {
		if bs.bitset.Bit(i) > 0 {
			cnt++
		}
	}

	return cnt
}

func (bs LocalDateBitSet) Empty() bool {
	return bs.bitset.BitLen() < 1
}
