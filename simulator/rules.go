package simulator

import (
	"fmt"
	"simba/newraft"
	"slices"
)

/*
This file will contian all the checks and rules given by RAFT algorithm such as:

No 2 leaders on the same Term
Logs should be the exact same on all the servers from log[0: minimumMatchIndex] (This checks the Commited entries)


wait until the end to check that all the servers contain the same data.


At the end the check will take all the CONFIRMED Entries, and check with the current leader, that will contain that one.
*/

func checkInvariants(nodeList []*newraft.Node) {
	checkSplitBrain(nodeList)
	checkCommitedEntries(nodeList)
}

func checkSplitBrain(nodeList []*newraft.Node) {
	var biggestTerm int

	for _, node := range nodeList {
		if node.CurrentRole == newraft.LEADER {
			if biggestTerm == node.CurrTerm {
				panic("There are 2 leaders on the same term")
			}
			biggestTerm = max(biggestTerm, node.CurrTerm)

		}

	}

}

// TODO: esto esta mal, deberia ser mucho mejor pero bue
func checkCommitedEntries(nodes []*newraft.Node) {
	for _, n := range nodes {
		if n.CommitIndex > len(n.Log)-1 {
			panic(fmt.Sprintf("%s: commitIndex %d > lastLogIndex %d", n.Id, n.CommitIndex, len(n.Log)-1))
		}
	}
	for i := range nodes {
		for j := i + 1; j < len(nodes); j++ {
			a, b := nodes[i], nodes[j]
			m := min(a.CommitIndex, b.CommitIndex)
			if !slices.Equal(a.Log[:m+1], b.Log[:m+1]) {
				panic(fmt.Sprintf("committed prefix mismatch %s vs %s", a.Id, b.Id))
			}
		}
	}
}
