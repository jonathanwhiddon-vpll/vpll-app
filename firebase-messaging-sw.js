importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDPmOcHBpu4Xnkta0Dxk5G1PVcMj0-8ypc",
  authDomain: "vpll-notices.firebaseapp.com",
  projectId: "vpll-notices",
  storageBucket: "vpll-notices.firebasestorage.app",
  messagingSenderId: "648218993728",
  appId: "1:648218993728:web:1caf35cc1c0eb9fa552ba5",
  measurementId: "G-WB85CMFX3L"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log("Received background message", payload);

  self.registration.showNotification(payload.notification.title, {
    body: payload.notification.body,
    icon: "60thlogo.jpg"
  });
});
