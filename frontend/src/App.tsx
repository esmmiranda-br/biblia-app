
import React, { useState } from 'react';
import { Login } from './components/Login';
import { Menu } from './components/Menu';


function App() {
  const [usuario, setUsuario] = useState<null | { id: number; usuario: string; perfil: string; token: string }>(null);

  return (
    <div className="app-container">
      {!usuario ? (
        <Login onLogin={setUsuario} />
      ) : (
        <Menu usuario={usuario} onLogout={() => setUsuario(null)} />
      )}
      {usuario && (
        <footer className="app-footer">
          <img src="/logo-igreja.png" alt="Comunidade Apostólica Novos Amigos" />
          <span>by Eduardo Miranda</span>
        </footer>
      )}
    </div>
  );
}

export default App;
