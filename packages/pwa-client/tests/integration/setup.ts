// WebSocket polyfill for Node environment
// @ts-ignore
import WebSocket from 'isomorphic-ws';

// Make WebSocket globally available
// @ts-ignore
global.WebSocket = WebSocket;