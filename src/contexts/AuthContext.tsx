import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('athena_user');
    if (stored) setUser(JSON.parse(stored));
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    // Mock auth - in production, connect to AWS Cognito or Lovable Cloud
    const accounts = JSON.parse(localStorage.getItem('athena_accounts') || '[]');
    const account = accounts.find((a: any) => a.email === email && a.password === password);
    if (!account) throw new Error('Invalid email or password');
    const u: User = { id: account.id, name: account.name, email: account.email };
    localStorage.setItem('athena_user', JSON.stringify(u));
    setUser(u);
  };

  const signup = async (name: string, email: string, password: string) => {
    const accounts = JSON.parse(localStorage.getItem('athena_accounts') || '[]');
    if (accounts.some((a: any) => a.email === email)) throw new Error('Account already exists');
    const newAccount = { id: crypto.randomUUID(), name, email, password };
    accounts.push(newAccount);
    localStorage.setItem('athena_accounts', JSON.stringify(accounts));
    const u: User = { id: newAccount.id, name, email };
    localStorage.setItem('athena_user', JSON.stringify(u));
    setUser(u);
  };

  const logout = () => {
    localStorage.removeItem('athena_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
