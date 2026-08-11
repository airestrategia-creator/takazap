import { AuthContext, useAuthState } from './useAuth.js';

export default function AuthProvider({ children }) {
  const value = useAuthState();
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
