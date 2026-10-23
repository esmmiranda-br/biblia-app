
import React, { useState } from 'react';
import { Login } from './components/Login';
import { Menu } from './components/Menu';


function App() {
  const [usuario, setUsuario] = useState<null | { id: number; usuario: string; perfil: string }>(null);

  return (
    <>
      {!usuario ? (
        <Login onLogin={setUsuario} />
      ) : (
        <Menu usuario={usuario} onLogout={() => setUsuario(null)} />
      )}
    </>
  );
}

export default App;
