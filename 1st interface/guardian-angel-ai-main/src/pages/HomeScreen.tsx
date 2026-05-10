import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Button } from '@/components/ui/button';
import {
  MapPin,
  Navigation,
  AlertTriangle
} from 'lucide-react';
import { MobileLayout } from '@/components/layout/MobileLayout';
import { BottomNav } from '@/components/layout/BottomNav';
import { useApp } from '@/contexts/AppContext';
import { useToast } from '@/hooks/use-toast';
import { SavedLocation } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { LanguageToggle } from '@/components/LanguageToggle';
import { sendSmsViaTextBee } from '@/services/smsService';

// Fix Leaflet marker icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Helper component to center map on position update
const RecenterMap = ({ lat, lng }: { lat: number; lng: number }) => {
  const map = useMap();
  React.useEffect(() => {
    map.setView([lat, lng], map.getZoom());
  }, [lat, lng, map]);
  return null;
};

const HomeScreen = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useApp();

  const [activeLocation, setActiveLocation] = useState<SavedLocation | null>(null);
  const [liveLocation, setLiveLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [liveAddress, setLiveAddress] = useState<string>('Locating...');

  // Ref to track last location save time for throttling
  const lastSaveTimeRef = React.useRef<number>(0);

  // Function to save live location to Supabase
  const saveLiveLocationToSupabase = async (lat: number, lng: number, address: string) => {
    if (!user?.id) return;

    const now = Date.now();
    const timeSinceLastSave = now - lastSaveTimeRef.current;

    // Throttle: only save every 30 seconds
    if (timeSinceLastSave < 30000) {
      return;
    }

    try {
      const { error } = await supabase
        .from('users' as any)
        .update({
          current_latitude: lat,
          current_longitude: lng,
          current_address: address,
          last_location_update: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) {
        console.error('Failed to save location to Supabase:', error);
      } else {
        console.log('Live location saved to Supabase');
        lastSaveTimeRef.current = now;
      }
    } catch (err) {
      console.error('Error saving location:', err);
    }
  };

  // Effect to get live location
  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setLiveLocation({ lat: latitude, lng: longitude });

        // Reverse geocoding and save location
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
            { headers: { 'User-Agent': 'RoadResQ Emergency App' } }
          );
          if (response.ok) {
            const data = await response.json();
            const address = data.display_name;
            setLiveAddress(address);

            // Save location to Supabase (throttled)
            await saveLiveLocationToSupabase(latitude, longitude, address);
          }
        } catch (e) {
          console.error("Geocoding error", e);
        }
      },
      (error) => {
        console.error("Location error", error);
        setLiveAddress("Location unavailable");
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 1000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [user?.id]); // Add user.id to dependencies

  // Fallback to saved location if no live location yet
  useEffect(() => {
    if (user?.savedLocations && user.savedLocations.length > 0) {
      const homeLocation = user.savedLocations.find(l => l.type === 'home');
      setActiveLocation(homeLocation || user.savedLocations[0]);
    }
  }, [user]);

  // Use live location if available, otherwise saved active location, otherwise default Mumbai
  const displayLat = liveLocation?.lat || activeLocation?.coordinates.lat || 19.076;
  const displayLng = liveLocation?.lng || activeLocation?.coordinates.lng || 72.877;
  const displayAddress = liveLocation ? liveAddress : (activeLocation?.address || 'Detecting location...');

  // Countdown state for accident delay
  const [countdown, setCountdown] = useState<number | null>(null);
  const [pendingEmergency, setPendingEmergency] = useState<string | null>(null);

  // Timer effect
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (countdown !== null && countdown > 0) {
      timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
    } else if (countdown === 0) {
      // Countdown finished, trigger emergency
      if (pendingEmergency) {
        triggerEmergency(pendingEmergency);
      }
      setCountdown(null);
      setPendingEmergency(null);
    }
    return () => clearTimeout(timer);
  }, [countdown, pendingEmergency]);

  const triggerEmergency = async (type: string) => {
    // 1. Get Location (use live or fallback)
    const lat = liveLocation?.lat || activeLocation?.coordinates.lat;
    const lng = liveLocation?.lng || activeLocation?.coordinates.lng;
    const addr = liveAddress || activeLocation?.address;

    if (!lat || !lng) {
      toast({
        title: "Location Required",
        description: "Please enable GPS or select a saved location.",
        variant: "destructive"
      });
      return;
    }

    // Unified flow for ALL emergency types - instant navigation to tracking screen
    try {
      // Store emergency info in sessionStorage for tracking screen to access
      sessionStorage.setItem('currentEmergencyType', type);
      sessionStorage.setItem('emergencyLocation', JSON.stringify({ lat, lng, address: addr }));

      // Navigate to tracking screen immediately
      navigate(`/tracking?type=${type}`);

      // Send alert in background
      supabase
        .from('emergency_requests' as any)
        .insert({
          patient_name: localStorage.getItem('userName') || 'Unknown',
          patient_phone: localStorage.getItem('userPhone') || '',
          emergency_type: type,
          patient_lat: lat,
          patient_long: lng,
          status: 'pending'
        })
        .then(() => console.log('Emergency alert sent'))
        .catch(err => console.error("Background Alert Error:", err));

      // Notify family
      if (user?.familyPhone) {
        toast({
          title: "Family Notified",
          description: `Alert sent to family member: ${user.familyPhone}`,
          duration: 5000,
        });

        // WhatsApp Integration
        const message = `SOS! I need help! I'm in a ${type} emergency.\nLocation: ${addr}\nMap: https://www.google.com/maps?q=${lat},${lng}`;
        const whatsappUrl = `https://wa.me/${user.familyPhone}?text=${encodeURIComponent(message)}`;

        // 1. Send Real SMS via TextBee API
        sendSmsViaTextBee(user.familyPhone, message).then((result) => {
          if (result.success) {
            console.log('SMS sent successfully via TextBee');
            toast({ title: "SMS Sent", description: "Emergency SMS sent to your relative." });
          } else {
            console.error('TextBee SMS failed:', result.error);
            toast({
              title: "SMS Failed",
              description: `Could not send SMS: ${result.error || "Unknown error"}`,
              variant: "destructive",
              duration: 5000
            });
          }
        });

        // 2. Open WhatsApp fallback
        setTimeout(() => {
          window.open(whatsappUrl, '_blank');
        }, 1500);
      }
    } catch (err) {
      console.error("Navigation Error:", err);
      // Still navigate to tracking even if storage fails
      navigate(`/tracking?type=${type}`);
    }
  };

  const handleEmergencyType = (type: string) => {
    // Start 10s countdown for ALL emergency types
    setPendingEmergency(type);
    setCountdown(10);
  };

  const cancelEmergency = () => {
    setCountdown(null);
    setPendingEmergency(null);
  };

  return (
    <MobileLayout
      showHeader
      headerContent={
        <div className="flex items-center justify-between w-full">
          <div>
            <h1 className="text-lg font-bold text-foreground">{t('app.title')}</h1>
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-medical animate-pulse" />
              <span className="text-muted-foreground">Ready</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <button
              onClick={() => navigate('/verification')}
              className="flex items-center gap-2 bg-muted px-3 py-2 rounded-xl"
            >
              <MapPin className="w-4 h-4 text-emergency" />
              <span className="text-sm font-medium text-foreground truncate max-w-[80px]">
                {displayAddress.split(',')[0]}
              </span>
            </button>
          </div>
        </div>
      }
      footer={<BottomNav />}
    >
      <div className="px-6 py-6 space-y-6">
        {/* Single EMERGENCY Button */}
        <div className="flex flex-col items-center justify-center space-y-4">
          <h2 className="text-base font-semibold text-muted-foreground uppercase tracking-wider text-center">
            {t('home.emergency')}
          </h2>
          <button
            onClick={() => handleEmergencyType('general')}
            className="group relative w-full flex flex-col items-center justify-center gap-4 py-12 rounded-3xl border-4 border-red-600 shadow-2xl hover:shadow-red-500/50 transition-all duration-300 active:scale-95 overflow-hidden bg-red-600 hover:bg-red-700"
            style={{ minHeight: '220px' }}
          >
            {/* Pulsing glow ring */}
            <span className="absolute w-40 h-40 rounded-full bg-white/10 animate-ping" />
            <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300 z-10">
              <AlertTriangle className="w-10 h-10 text-white" />
            </div>
            <span className="text-3xl font-black text-white tracking-widest uppercase z-10">
              EMERGENCY
            </span>
            <span className="text-sm text-white/80 font-medium z-10">Press to send SOS alert</span>
          </button>
        </div>

        {/* Location Status with Map */}
        <div className="rounded-3xl border border-white/30 overflow-hidden shadow-xl bg-white/40 backdrop-blur-md">
          <div className="p-4 pb-2 flex items-center justify-between z-10 relative">
            <h3 className="font-bold text-foreground/80 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              {t('home.location')}
            </h3>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-500/10 text-green-600 flex items-center gap-2 border border-green-500/20">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
              </span>
              Live GPS
            </span>
          </div>

          <div className="h-[200px] w-full relative z-0 mt-2">
            <MapContainer
              center={[displayLat, displayLng]}
              zoom={17}
              style={{ height: '100%', width: '100%' }}
              scrollWheelZoom={false}
              dragging={false}
              zoomControl={false}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <Marker position={[displayLat, displayLng]} />
              <RecenterMap lat={displayLat} lng={displayLng} />
            </MapContainer>

            {/* Overlay Gradient */}
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white/90 to-transparent pointer-events-none z-[400]" />
          </div>

          <div className="p-4 bg-white/50 backdrop-blur-sm border-t border-white/20 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0 border border-blue-200">
              <Navigation className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground truncate">
                {displayAddress}
              </p>
              <p className="text-xs text-muted-foreground font-medium">
                {liveLocation ? 'Precise Location Active' : 'Loading Location...'}
              </p>
            </div>
          </div>
        </div>

        {/* First Aid Assistant Promo */}
        <button
          onClick={() => navigate('/first-aid')}
          className="w-full bg-gradient-to-r from-safe to-safe/80 rounded-2xl p-4 flex items-center gap-4 text-left transition-transform hover:scale-[1.02] active:scale-[0.98]"
        >
          <div className="w-12 h-12 bg-secondary-foreground/20 rounded-xl flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-secondary-foreground" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-secondary-foreground">AI First-Aid Assistant</h3>
            <p className="text-sm text-secondary-foreground/80">Get guided emergency instructions</p>
          </div>
          <div className="text-2xl">→</div>
        </button>
      </div>

      {/* Countdown Overlay */}
      {countdown !== null && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="w-full max-w-sm flex flex-col items-center space-y-8 text-center">
            <div className="w-32 h-32 rounded-full bg-emergency/10 flex items-center justify-center relative">
              <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="8"
                  className="text-muted/20"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="8"
                  className="text-emergency transition-all duration-1000 ease-linear"
                  strokeDasharray="283"
                  strokeDashoffset={283 - (283 * countdown) / 10}
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-4xl font-bold text-emergency">{countdown}</span>
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold">Sending Alert...</h2>
              <p className="text-muted-foreground">
                We are contacting emergency services in {countdown} seconds.
              </p>
            </div>

            <Button
              size="lg"
              variant="outline"
              className="w-full py-6 text-lg border-2"
              onClick={cancelEmergency}
            >
              Cancel Emergency
            </Button>
          </div>
        </div>
      )}
    </MobileLayout>
  );
};

export default HomeScreen;
