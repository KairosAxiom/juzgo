import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Plans from './pages/Plans';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Checkout from './pages/Checkout';
import OrderConfirmation from './pages/OrderConfirmation';
import LoginSuccess from './pages/LoginSuccess';
import Wallet from './pages/Wallet';
import Admin from './pages/Admin';
import Itinerary from './pages/Itinerary';
import Purchases from './pages/Purchases';
import FindMyOrder from './pages/FindMyOrder';
import SavedItineraries from './pages/SavedItineraries';
import TermsAndConditions from './pages/TermsAndConditions';
import CorporateRegister from './pages/CorporateRegister';
import CorporateDashboard from './pages/CorporateDashboard';
import CorporateInvite from './pages/CorporateInvite';
import ResetPassword from './pages/ResetPassword';

function App() {
  // Capture ?ref= reseller/referral code on any page load — stores for 30 days
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      localStorage.setItem('juzgo_ref', JSON.stringify({
        code:    ref.toUpperCase(),
        expires: Date.now() + 30 * 24 * 60 * 60 * 1000,
      }));
      const url = new URL(window.location.href);
      url.searchParams.delete('ref');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/"                      element={<Home />} />
        <Route path="/plans"                 element={<Plans />} />
        <Route path="/login"                 element={<Login />} />
        <Route path="/register"              element={<Register />} />
        <Route path="/dashboard"             element={<Dashboard />} />
        <Route path="/checkout"              element={<Checkout />} />
        <Route path="/order-confirmation"    element={<OrderConfirmation />} />
        <Route path="/login-success"         element={<LoginSuccess />} />
        <Route path="/wallet"                element={<Wallet />} />
        <Route path="/admin"                 element={<Admin />} />
        <Route path="/itinerary"             element={<Itinerary />} />
        <Route path="/purchases"             element={<Purchases />} />
        <Route path="/find-order"            element={<FindMyOrder />} />
        <Route path="/saved-itineraries"     element={<SavedItineraries />} />
        <Route path="/terms"                 element={<TermsAndConditions />} />
        <Route path="/corporate/register"    element={<CorporateRegister />} />
        <Route path="/corporate/dashboard"   element={<CorporateDashboard />} />
        <Route path="/corporate/invite/:token" element={<CorporateInvite />} />
        <Route path="/reset-password"         element={<ResetPassword />} />
        <Route path="*"                      element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
