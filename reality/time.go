package reality

//
// import (
// 	raft "simba/raft"
// 	"time"
// )
//
// type PhysicalTime struct {
// }
//
// func (st *PhysicalTime) Now() int64 {
// 	currTime := time.Now()
// 	return currTime.Unix()
// }
// func (st *PhysicalTime) Advance(delta int64) {
// }
//
// func (st *PhysicalTime) Sleep(ms int64) {
// 	time.Sleep(time.Millisecond * time.Duration(ms))
// }
// func (st *PhysicalTime) DetermineTimeouts(node *raft.Node, transportAdapter raft.TransportAdapter) {
// 	// time.Sleep(time.Millisecond * time.Duration(ms))
// }
