package simulator

import (
	"fmt"
	"simba/newraft"
)

type Checker struct {
	leaderOfTerm map[int]string
	committed    map[int]newraft.Entry
}

func NewChecker() *Checker {
	return &Checker{
		leaderOfTerm: map[int]string{},
		committed:    map[int]newraft.Entry{},
	}
}

func (c *Checker) Check(nodes []*newraft.Node) {
	for _, n := range nodes {
		if n.CommitIndex > len(n.Log)-1 {
			panic(fmt.Sprintf("%s: commitIndex %d > lastLogIndex %d", n.Id, n.CommitIndex, len(n.Log)-1))
		}

		// Election Safety, con historia
		if n.CurrentRole == newraft.LEADER {
			if prev, ok := c.leaderOfTerm[n.CurrTerm]; ok && prev != n.Id {
				panic(fmt.Sprintf("term %d: líderes %s y %s", n.CurrTerm, prev, n.Id))
			}
			c.leaderOfTerm[n.CurrTerm] = n.Id
		}

		// State Machine Safety, con memoria global
		for i := 1; i <= n.CommitIndex; i++ {
			if prev, ok := c.committed[i]; ok {
				if prev != n.Log[i] {
					panic(fmt.Sprintf("%s tiene %+v en index %d, ya se había commiteado %+v", n.Id, n.Log[i], i, prev))
				}
			} else {
				c.committed[i] = n.Log[i]
			}
		}
	}

	// Leader Completeness: todo líder debe tener todo lo commiteado hasta ahora
	for _, n := range nodes {
		if n.CurrentRole != newraft.LEADER {
			continue
		}
		for i, e := range c.committed {
			if i > len(n.Log)-1 || n.Log[i] != e {
				panic(fmt.Sprintf("Leader Completeness: %s (term %d) no tiene el index %d commiteado: %+v", n.Id, n.CurrTerm, i, e))
			}
		}
	}
}
