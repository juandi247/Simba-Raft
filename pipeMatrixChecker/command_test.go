package main

import (
	"fmt"
	"testing"
)

func TestCommand(t *testing.T) {

	fmt.Println("hoal")
	err := runSimulator(1234, "low")
	if err != nil {
		t.Errorf("Error on test: %v", err)
	}

}
