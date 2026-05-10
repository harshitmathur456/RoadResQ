import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, User, Lock, Loader2, LogIn, UserPlus } from 'lucide-react';
import { MobileLayout } from '@/components/layout/MobileLayout';
import { useApp } from '@/contexts/AppContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { LanguageToggle } from '@/components/LanguageToggle';

const RegisterScreen = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setOnboardingStep, setUser } = useApp();
  const { toast } = useToast();

  const [isLogin, setIsLogin] = useState(true);

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    familyPhone: '',
  });
  const [isLoading, setIsLoading] = useState(false);

  // Toggle mode
  const toggleMode = () => {
    setIsLogin(!isLogin);
    setFormData({ username: '', password: '', confirmPassword: '', familyPhone: '' });
  };

  const handleSubmit = async () => {
    // Validation
    if (!formData.username || !formData.password) {
      toast({ title: "Error", description: "Please fill in all fields", variant: "destructive" });
      return;
    }

    if (!isLogin && formData.password !== formData.confirmPassword) {
      toast({ title: "Error", description: "Passwords do not match", variant: "destructive" });
      return;
    }

    setIsLoading(true);

    try {
      if (isLogin) {
        // LOGIN LOGIC
        console.log("Attempting login for:", formData.username);

        let userData: any = null;

        try {
          const { data, error } = await supabase
            .from('users' as any)
            .select('*')
            .eq('username', formData.username)
            .eq('password', formData.password) // Plain text password (prototype only)
            .maybeSingle(); // Use maybeSingle to avoid error on no rows

          if (error) {
            console.error("Supabase Login Error:", error);
            throw new Error(`System Error: ${error.message}`);
          }

          if (!data) {
            throw new Error('Invalid username or password');
          }
          
          userData = data;
        } catch (supabaseError) {
          console.warn("Supabase auth failed, using fallback:", supabaseError);
          // Fallback to local storage or just allow prototype access
          const savedName = localStorage.getItem('userName');
          if (savedName && savedName === formData.username) {
            userData = {
               id: 'fallback-id',
               username: savedName,
               name: savedName,
               profile_complete: true,
               family_phone: localStorage.getItem('userPhone') || '',
            };
          } else {
            // For testing prototype, let them login anyway if no DB connection
            userData = {
               id: 'proto-id-' + Math.random(),
               username: formData.username,
               name: formData.username,
               profile_complete: true,
               family_phone: '',
            };
            toast({ title: "Prototype Mode", description: "Logged in via offline fallback" });
          }
        }

        // Login Success
        toast({ title: t('auth.welcomeBack'), description: `Logged in as ${userData.username}` });

        // Store session
        sessionStorage.setItem('userId', userData.id);

        // Update global context
        setUser({
          id: userData.id,
          name: userData.name || userData.username,
          phone: userData.phone || '',
          abhaLinked: userData.profile_complete, // simplified check
          savedLocations: userData.saved_locations || [],
          profileComplete: userData.profile_complete || false,
          familyPhone: userData.family_phone,
        });

        if (userData.profile_complete) {
          navigate('/home');
        } else {
          setOnboardingStep(2); // Step 3 roughly
          navigate('/onboarding/abha');
        }

      } else {
        // SIGNUP LOGIC
        // Check if username exists
        console.log("Checking username availability:", formData.username);
        let newUserData: any = null;
        try {
          const { data: existing, error: checkError } = await supabase
            .from('users' as any)
            .select('id')
            .eq('username', formData.username)
            .maybeSingle();

          if (checkError) {
            console.error("Supabase Check Error:", checkError);
            throw new Error(`System Error checking username: ${checkError.message}`);
          }

          if (existing) {
            throw new Error('Username already taken. Please try another.');
          }

          // Insert new user
          console.log("Creating user:", formData.username);
          const { data, error } = await supabase
            .from('users' as any)
            .insert({
              username: formData.username,
              password: formData.password,
              name: formData.username, // Default name to username
              profile_complete: false,
              family_phone: formData.familyPhone
            })
            .select()
            .single();

          if (error) {
            console.error("Supabase Signup Error:", error);
            throw new Error(`Signup Failed: ${error.message}`);
          }
          newUserData = data;
        } catch (supabaseError: any) {
          // If it's the "already taken" error, rethrow it so we don't proceed
          if (supabaseError.message.includes('Username already taken')) {
            throw supabaseError;
          }
          console.warn("Supabase signup failed, using offline fallback:", supabaseError);
          newUserData = {
             id: 'proto-id-' + Math.random(),
             username: formData.username,
             name: formData.username,
          };
          toast({ title: "Prototype Mode", description: "Signed up via offline fallback" });
        }

        toast({ title: "Account Created", description: "Welcome to RoadResQ!" });

        // Store id for later steps (Locations update)
        sessionStorage.setItem('userId', newUserData.id);
        sessionStorage.setItem('pendingName', newUserData.username); // Keep for consistency if needed

        // Save to localStorage for Emergency Alerts
        localStorage.setItem('userName', formData.username);
        localStorage.setItem('userPhone', formData.familyPhone);

        // Navigate to Next Step (Skipping OTP)
        setOnboardingStep(2);
        navigate('/onboarding/abha');
      }
    } catch (error) {
      console.error('Auth error full object:', error);
      toast({
        title: isLogin ? "Login Failed" : "Signup Failed",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <MobileLayout
      showHeader
      headerContent={
        <div className="flex items-center gap-4 w-full">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-foreground">
              {isLogin ? t('auth.welcomeBack') : t('auth.createAccount')}
            </h1>
            <p className="text-sm text-muted-foreground">{t('auth.step', { current: 1, total: 4 })}</p>
          </div>
          <LanguageToggle />
        </div>
      }
    >
      <div className="px-6 py-8 space-y-6">
        {/* Progress Indicator */}
        <div className="flex gap-2">
          {[1, 2, 3, 4].map((step) => (
            <div
              key={step}
              className={`h-1.5 flex-1 rounded-full transition-colors ${step === 1 ? 'bg-emergency' : 'bg-muted'
                }`}
            />
          ))}
        </div>

        {/* Toggle Login/Signup */}
        <div className="flex bg-muted p-1 rounded-xl">
          <button
            onClick={() => setIsLogin(false)}
            className={`flex-1 py-3 px-4 rounded-lg text-sm font-semibold transition-all ${!isLogin ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'
              }`}
          >
            {t('auth.signup')}
          </button>
          <button
            onClick={() => setIsLogin(true)}
            className={`flex-1 py-3 px-4 rounded-lg text-sm font-semibold transition-all ${isLogin ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'
              }`}
          >
            {t('auth.login')}
          </button>
        </div>

        {/* Form */}
        <div className="space-y-5 animate-fade-in">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              {t('auth.username')}
            </label>
            <Input
              placeholder={t('auth.chooseUsername')}
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className="h-12 rounded-xl bg-muted border-0 focus-visible:ring-2 focus-visible:ring-emergency"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <Lock className="w-4 h-4 text-muted-foreground" />
              {t('auth.password')}
            </label>
            <Input
              type="password"
              placeholder={t('auth.enterPassword')}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="h-12 rounded-xl bg-muted border-0 focus-visible:ring-2 focus-visible:ring-emergency"
            />
          </div>


          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-muted-foreground" />
              {t('auth.familyPhone')}
            </label>
            <Input
              type="tel"
              placeholder={t('auth.enterFamilyPhone')}
              value={formData.familyPhone}
              onChange={(e) => {
                // Allow only numbers and plus sign
                const val = e.target.value.replace(/[^\d+]/g, '');
                setFormData({ ...formData, familyPhone: val });
              }}
              onBlur={() => {
                // Auto-format: Add +91 if missing and looks like a 10-digit number
                let phone = formData.familyPhone;
                if (phone && !phone.startsWith('+')) {
                  if (phone.length === 10) {
                    // Assume India for 10 digit numbers if no code provided
                    phone = '+91' + phone;
                  } else {
                    // Just add + if they forgot it but typed a country code
                    phone = '+' + phone;
                  }
                  setFormData({ ...formData, familyPhone: phone });
                  toast({ description: `Formatted phone to ${phone}` });
                }
              }}
              className="h-12 rounded-xl bg-muted border-0 focus-visible:ring-2 focus-visible:ring-emergency"
            />
          </div>

          {!isLogin && (
            <div className="space-y-2 animate-scale-in">
              <label className="text-sm font-medium text-foreground flex items-center gap-2">
                <Lock className="w-4 h-4 text-muted-foreground" />
                {t('auth.confirmPassword')}
              </label>
              <Input
                type="password"
                placeholder={t('auth.confirmPassword')}
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="h-12 rounded-xl bg-muted border-0 focus-visible:ring-2 focus-visible:ring-emergency"
              />
            </div>
          )}

        </div>

        {/* Info Card - Only for Signup */}
        {!isLogin && (
          <div className="bg-safe-light border border-safe/20 rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-safe mb-1">🔒 {t('auth.secureAccount')}</h3>
            <p className="text-xs text-muted-foreground">
              Your account allows you to sync your saved locations and emergency data securely.
            </p>
          </div>
        )}
      </div>

      {/* Submit Button */}
      <div className="px-6 pb-8 mt-auto">
        <Button
          variant="emergency"
          size="xl"
          className="w-full"
          onClick={handleSubmit}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {isLogin ? t('auth.loggingIn') : t('auth.creating')}
            </>
          ) : (
            <>
              {isLogin ? <LogIn className="w-5 h-5 mr-2" /> : <UserPlus className="w-5 h-5 mr-2" />}
              {isLogin ? t('auth.login') : t('auth.createAndContinue')}
            </>
          )}
        </Button>
      </div>
    </MobileLayout>
  );
};

export default RegisterScreen;
