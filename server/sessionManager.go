package server

import (
	"sync"
	"github.com/google/uuid"
)

type SimulatorSessionManager struct {
	simulatorSessions sync.Map 
}

func (s *SimulatorSessionManager) cleanupSession(uid uuid.UUID) {
	s.simulatorSessions.Delete(uid)
}
