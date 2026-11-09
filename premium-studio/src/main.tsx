import React from 'react';import{createRoot}from'react-dom/client';import{App}from'./App';import './styles.css';
// Preserve existing invitation, password-recovery and MFA setup flows without
// exposing a competing workspace in the regular navigation.
const hash=window.location.hash;
if(/^#(?:owner-invitation|invitation|password-reset|reset-password|verify-email|mfa-setup)\//.test(hash)){
 window.location.replace('/legacy-console'+hash);
}else{
 const root=document.getElementById('root');
 if(root)createRoot(root).render(<React.StrictMode><App/></React.StrictMode>);
}
