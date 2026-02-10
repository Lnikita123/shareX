export function getIceServers(): RTCConfiguration {
  const turnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const turnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

  const iceServers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
  ];

  if (turnUsername && turnCredential) {
    iceServers.push(
      {
        urls: "turn:a.relay.metered.ca:80",
        username: turnUsername,
        credential: turnCredential,
      },
      {
        urls: "turn:a.relay.metered.ca:80?transport=tcp",
        username: turnUsername,
        credential: turnCredential,
      },
      {
        urls: "turn:a.relay.metered.ca:443",
        username: turnUsername,
        credential: turnCredential,
      },
      {
        urls: "turns:a.relay.metered.ca:443?transport=tcp",
        username: turnUsername,
        credential: turnCredential,
      }
    );
  }

  return {
    iceServers,
    iceCandidatePoolSize: 10,
  };
}
