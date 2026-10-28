package simulator

import (
	"math/rand"
	"strconv"
)

func buildFriendsIds(numberOfFriends int, nodeIndex int) []string {
	rta := []string{}
	for i := 1; i <= numberOfFriends; i++ {
		if i != nodeIndex {
			rta = append(rta, "Node"+strconv.Itoa(i))
		}

	}
	return rta
}

func generateHeartbeatTimeout(rng *rand.Rand, extra int) uint32 {
	newMinimum := MinHeartBeatTimeout + extra
	maxHeartbeatTimeout:= newMinimum + 10
	t := uint32(newMinimum + rng.Intn(maxHeartbeatTimeout-newMinimum+1))
	return t
}
