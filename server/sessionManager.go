package server

import (
	"github.com/google/uuid"
	"sync"
)

type SimulatorSessionManager struct {
	simulatorSessions sync.Map
}

func (s *SimulatorSessionManager) cleanupSession(uid uuid.UUID) {
	s.simulatorSessions.Delete(uid)
}
