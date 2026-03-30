import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Database, Mail, Lock, User, Eye, EyeOff, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export default function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signup, confirmSignup, needsConfirmation, confirmationEmail } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast({ title: 'Weak password', description: 'Password must be at least 8 characters with uppercase, lowercase, number, and symbol.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      await signup(name, email, password);
      toast({ title: 'Account created!', description: 'Check your email for a verification code.' });
    } catch (err: any) {
      toast({ title: 'Sign up failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await confirmSignup(confirmationEmail || email, confirmCode);
      toast({ title: 'Email confirmed!', description: 'You can now sign in.' });
      navigate('/login');
    } catch (err: any) {
      toast({ title: 'Confirmation failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <Link to="/landing" className="inline-flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 glow-primary">
              <Database className="h-5 w-5 text-primary" />
            </div>
            <span className="text-lg font-bold text-foreground">Athena Optimizer</span>
          </Link>
          <h1 className="mt-6 text-2xl font-bold text-foreground">
            {needsConfirmation ? 'Verify your email' : 'Create your account'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {needsConfirmation
              ? `Enter the code sent to ${confirmationEmail || email}`
              : 'Sign up with your AWS Cognito credentials'}
          </p>
        </div>

        {needsConfirmation ? (
          <form onSubmit={handleConfirm} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Verification Code</Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="code" placeholder="123456" value={confirmCode} onChange={e => setConfirmCode(e.target.value)} className="pl-10 text-center tracking-widest" required maxLength={10} />
              </div>
            </div>
            <Button type="submit" className="w-full glow-primary" disabled={loading}>
              {loading ? 'Verifying...' : 'Confirm Email'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="name" placeholder="John Doe" value={name} onChange={e => setName(e.target.value)} className="pl-10" required maxLength={100} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} className="pl-10" required maxLength={255} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="password" type={showPassword ? 'text' : 'password'} placeholder="Min 8 chars, upper+lower+number+symbol" value={password} onChange={e => setPassword(e.target.value)} className="pl-10 pr-10" required minLength={8} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Must include uppercase, lowercase, number, and special character</p>
            </div>
            <Button type="submit" className="w-full glow-primary" disabled={loading}>
              {loading ? 'Creating account...' : 'Get Started'}
            </Button>
          </form>
        )}

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
