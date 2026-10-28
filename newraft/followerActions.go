package newraft

import "fmt"

/* ---- METHODS REACTING TO INCOMING EVENTS -------- */
func (n *Node) HandleFollowerAction(mesage Message) []Message {

	switch mesage.Type {

	case MsgAppendEntries:
		payload, ok := mesage.Payload.(AppendEntriesEvent)
		if !ok {
			panic("casting error on append entries ")
		}
		return n.HandleAppendEntries(payload)

	case MsgRequestVote:
		payload, ok := mesage.Payload.(RequestVoteEvent)
		if !ok {
			panic("casting error on SendRequestVoteResponse ")
		}
		return n.HandleRequestVote(payload)

	case MsgHeartbeatTimeout:
		return n.handleHeartbeatTimeout()

	case MsgNewEntry:
		return []Message{
			{
				SenderId:   n.Id,
				ReceiverId: "CLIENT",
				Term:       n.CurrTerm,
				Type:       MsgLeaderCheck,
				Payload:    LeaderCheck{LeaderId: n.CurrentLeader}},
		}
	}

	return nil
}

func (n *Node) HandleAppendEntries(requestEvent AppendEntriesEvent) []Message {
	if requestEvent.PrevLogIndex < 0 {
		panic("PrevLogIndex negativo")
	}

	//this is a trick just for the simulated stuff
	if n.SimulatorFields != nil {
		n.SimulatorFields.HeartbeatTimeoutCounter = n.HeartbeatTimeout
	}
	//TODO: aca deberia reiniciar el timer o ticket de timeout, o algo (incluso podria ir en el mensaje de reiniciar para fire and forger)
	n.CurrentLeader = requestEvent.LeaderId

	messages := []Message{}
	responseMessage := Message{
		SenderId:   n.Id,
		Term:       n.CurrTerm,
		ReceiverId: requestEvent.LeaderId,
		Type:       MsgAppendEntriesResponse,
	}

	responseEvent := AppendEntriesResponseEvent{
		Term:   n.CurrTerm,
		Succes: false,
		/*  NOTE: this is a work arround, because is a fire and forget. If 2 resopnses go to the leader at the same time and the leader did
		   			a nextIndex[follower]--, this will make him go to a netIndex of -1. Which is NEGATIVE and asserted. The
					follower sends the prevlogindex which is automatically the --, without making it the leader itself.
					Then the leader will take this MatchIndex, and assign it to the NextIndex, so the -- ocurrs on the assignation
		*/
		MatchIndex: requestEvent.PrevLogIndex,
	}

	followerLastIndex := len(n.Log) - 1

	//if log does not contain an entry on the prevLogIndex, automatic error, this makes sure we have something in the same index
	if requestEvent.PrevLogIndex > followerLastIndex {
		responseEvent.MatchIndex = requestEvent.PrevLogIndex
		responseMessage.Payload = responseEvent
		return append(messages, responseMessage)

	}

	//if the Term does not match, we have a problem
	if requestEvent.PrevLogTerm != n.Log[requestEvent.PrevLogIndex].Term {
		responseEvent.MatchIndex = requestEvent.PrevLogIndex
		responseMessage.Payload = responseEvent
		return append(messages, responseMessage)

	}

	//HAPPY PATH
	for i, e := range requestEvent.Entries {
		if e.Index != requestEvent.PrevLogIndex+1+i {
			panic("entries no consecutivas")
		}
	}

	for i, e := range requestEvent.Entries {
		if e.Index <= len(n.Log)-1 {
			if n.Log[e.Index].Term == e.Term {
				continue // ya la tengo (mismo index+term => misma entrada)
			}
			// conflicto: nunca debería tocar algo ya commiteado
			if e.Index <= n.CommitIndex {
				panic(fmt.Sprintf("%s: conflicto en index %d <= commitIndex %d", n.Id, e.Index, n.CommitIndex))
			}
			n.Log = n.Log[:e.Index] // borra la entrada en conflicto y todo lo que sigue
		}
		if e.Index != len(n.Log) {
			panic("hueco al hacer append")
		}
		n.Log = append(n.Log, requestEvent.Entries[i:]...)
		break
	}

	lastNew := requestEvent.PrevLogIndex + len(requestEvent.Entries)
	if lastNew > len(n.Log)-1 {
		panic("lastNew fuera del log")
	}

	responseEvent.Succes = true
	responseEvent.MatchIndex = lastNew

	newCommit := min(requestEvent.LeaderCommitIndex, lastNew)
	if newCommit > n.CommitIndex {
		n.CommitIndex = newCommit
	}

	responseMessage.Payload = responseEvent

	return append(messages, responseMessage)

}

func (n *Node) HandleRequestVote(requestEvent RequestVoteEvent) []Message {

	messages := []Message{}
	responseMessage := Message{
		SenderId:   n.Id,
		Term:       n.CurrTerm,
		ReceiverId: requestEvent.CandidateId,
		Type:       MsgRequestVoteResponse,
	}

	responseEventPayload := RequestVoteResponseEvent{
		Term:        n.CurrTerm,
		VoteGranted: false,
	}

	//NOTE: RULES TO NOT Grant any vote
	if requestEvent.Term < n.CurrTerm {
		responseMessage.Payload = responseEventPayload
		return append(messages, responseMessage)
	}

	//MEans that i ALREADY voted for someone in this TERM
	if len(n.VotedFor) > 0 {
		responseMessage.Payload = responseEventPayload
		return append(messages, responseMessage)
	}

	followerLastLogIndex := len(n.Log) - 1
	followerLastLogTerm := n.Log[followerLastLogIndex].Term
	if requestEvent.LastLogTerm < followerLastLogTerm {
		responseMessage.Payload = responseEventPayload
		return append(messages, responseMessage)
	}

	if requestEvent.LastLogTerm == followerLastLogTerm && requestEvent.LastLogIndex < followerLastLogIndex {
		responseMessage.Payload = responseEventPayload
		return append(messages, responseMessage)

	}

	/* ----HAPPY PATH --- */
	n.VotedFor = requestEvent.CandidateId
	n.SimulatorFields.HeartbeatTimeoutCounter = n.HeartbeatTimeout // (o el valor aleatorio de 2.8)


	responseEventPayload.VoteGranted = true
	responseMessage.Payload = responseEventPayload
	return append(messages, responseMessage)

}

// Starts an election as soon as the transition ocurres
func (n *Node) handleHeartbeatTimeout() []Message {
	n.updateTerm(n.CurrTerm + 1)
	//TODO: update term on storage
	return n.transitionRole(CANDIDATE)
}

func (n *Node) checkEntryExists(index int) bool {

	if index > len(n.Log)-1 {
		return false
	}

	return true
}

func (n *Node) checkEntryTerm(index int) bool {

	if index > len(n.Log)-1 {
		return false
	}

	return true
}
