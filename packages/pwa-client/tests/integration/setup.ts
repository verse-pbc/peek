// WebSocket polyfill for Node environment
// @ts-expect-error - Node environment doesn't have WebSocket types
import WebSocket from 'isomorphic-ws';

// Make WebSocket globally available
// @ts-expect-error - Adding WebSocket to global scope
global.WebSocket = WebSocket;