import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';
import { COGNITO_CONFIG } from '@/lib/cognitoConfig';
import { getAwsIdentity, AwsIdentityInfo } from '@/lib/awsIdentity';

const userPool = new CognitoUserPool({
  UserPoolId: COGNITO_CONFIG.UserPoolId,
  ClientId: COGNITO_CONFIG.ClientId,
});

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  awsIdentity: AwsIdentityInfo | null;
  awsIdentityLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  confirmSignup: (email: string, code: string) => Promise<void>;
  logout: () => void;
  needsConfirmation: boolean;
  confirmationEmail: string;
}

const AuthContext = createContext<AuthContextType | null>(null);

function getAttributeValue(attrs: CognitoUserAttribute[], name: string): string {
  return attrs.find((a) => a.getName() === name)?.getValue() || '';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [awsIdentity, setAwsIdentity] = useState<AwsIdentityInfo | null>(null);
  const [awsIdentityLoading, setAwsIdentityLoading] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState('');

  const fetchAwsIdentity = async (session: CognitoUserSession) => {
    setAwsIdentityLoading(true);
    try {
      const idToken = session.getIdToken().getJwtToken();
      const identity = await getAwsIdentity(idToken);
      setAwsIdentity(identity);
    } catch (e) {
      console.warn('Could not fetch AWS identity:', e);
    } finally {
      setAwsIdentityLoading(false);
    }
  };

  // Check for existing session on mount
  useEffect(() => {
    const cognitoUser = userPool.getCurrentUser();
    if (cognitoUser) {
      cognitoUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
        if (err || !session?.isValid()) {
          setIsLoading(false);
          return;
        }
        cognitoUser.getUserAttributes((err, attrs) => {
          if (err || !attrs) {
            setIsLoading(false);
            return;
          }
          setUser({
            id: getAttributeValue(attrs, 'sub'),
            name: getAttributeValue(attrs, 'name'),
            email: getAttributeValue(attrs, 'email'),
          });
          fetchAwsIdentity(session);
          setIsLoading(false);
        });
      });
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = (email: string, password: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });
      const authDetails = new AuthenticationDetails({ Username: email, Password: password });

      cognitoUser.authenticateUser(authDetails, {
        onSuccess: () => {
          cognitoUser.getUserAttributes((err, attrs) => {
            if (err || !attrs) {
              reject(new Error('Failed to get user attributes'));
              return;
            }
            setUser({
              id: getAttributeValue(attrs, 'sub'),
              name: getAttributeValue(attrs, 'name'),
              email: getAttributeValue(attrs, 'email'),
            });
            resolve();
          });
        },
        onFailure: (err) => {
          if (err.code === 'UserNotConfirmedException') {
            setNeedsConfirmation(true);
            setConfirmationEmail(email);
            reject(new Error('Please confirm your email first. Check your inbox for a verification code.'));
          } else {
            reject(new Error(err.message || 'Login failed'));
          }
        },
      });
    });
  };

  const signup = (name: string, email: string, password: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const attributes = [
        new CognitoUserAttribute({ Name: 'email', Value: email }),
        new CognitoUserAttribute({ Name: 'name', Value: name }),
      ];

      userPool.signUp(email, password, attributes, [], (err, result) => {
        if (err) {
          reject(new Error(err.message || 'Signup failed'));
          return;
        }
        setNeedsConfirmation(true);
        setConfirmationEmail(email);
        resolve();
      });
    });
  };

  const confirmSignup = (email: string, code: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });
      cognitoUser.confirmRegistration(code, true, (err) => {
        if (err) {
          reject(new Error(err.message || 'Confirmation failed'));
          return;
        }
        setNeedsConfirmation(false);
        setConfirmationEmail('');
        resolve();
      });
    });
  };

  const logout = () => {
    const cognitoUser = userPool.getCurrentUser();
    if (cognitoUser) cognitoUser.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, confirmSignup, logout, needsConfirmation, confirmationEmail }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
