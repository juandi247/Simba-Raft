package newraft

import "testing"

func TestMinQuorumValue(t *testing.T) {

	table := []struct {
		name     string
		mapa     map[string]int
		quorum   int
		expected int
	}{

		{
			mapa:     map[string]int{"node1": 1, "node2": 1, "node3": 1},
			quorum:   2,
			expected: 1,
		},

		{
			mapa:     map[string]int{"node1": 1, "node2": 0, "node3": 1, "node4": 0, "node5": 1},
			quorum:   3,
			expected: 1,
		},

		{
			mapa:     map[string]int{"node1": 0, "node2": 0, "node3": 1, "node4": 0, "node5": 1},
			quorum:   3,
			expected: 0,
		},
	}

	for i, testRow := range table {

		result := minQuorumValue(testRow.mapa, testRow.quorum)

		if result != testRow.expected {
			t.Errorf("TEST [ %d ] : Result: %d diferent as expeted: %d \n", i+1, result, testRow.expected)
		}
	}

}
