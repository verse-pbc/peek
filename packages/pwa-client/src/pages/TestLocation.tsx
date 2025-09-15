import React, { useState, useCallback } from 'react';
import { LocationPermission } from '../components/LocationPermission';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const TestLocationPage: React.FC = () => {
  const navigate = useNavigate();
  const [capturedLocation, setCapturedLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: number;
  } | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const handleLocationCaptured = useCallback((location: {
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: number;
  }) => {
    setCapturedLocation(location);
    console.log('Location captured:', location);
  }, []);

  const handlePermissionDenied = useCallback(() => {
    setPermissionDenied(true);
    console.log('Location permission denied');
  }, []);

  const handleBack = () => {
    navigate('/');
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={handleBack}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Home
        </Button>
        
        <h1 className="text-3xl font-bold mb-2">Test Location Permission</h1>
        <p className="text-gray-600">
          Testing the location permission component for Peek communities
        </p>
      </div>

      <LocationPermission 
        onLocationCaptured={handleLocationCaptured}
        onPermissionDenied={handlePermissionDenied}
        maxAccuracy={20}
        autoStart={false}
      />

      {capturedLocation && (
        <div className="mt-6 space-y-4">
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-800">Location Successfully Captured!</AlertTitle>
            <AlertDescription className="text-green-700">
              <div className="mt-2 space-y-1 font-mono text-sm">
                <p>Latitude: {capturedLocation.latitude.toFixed(6)}</p>
                <p>Longitude: {capturedLocation.longitude.toFixed(6)}</p>
                <p>Accuracy: {capturedLocation.accuracy.toFixed(1)}m</p>
                <p>Time: {new Date(capturedLocation.timestamp).toLocaleString()}</p>
              </div>
            </AlertDescription>
          </Alert>
          
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-semibold text-blue-900 mb-2">Verification Data</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Google Maps Link:</span>
                <a 
                  href={`https://www.google.com/maps?q=${capturedLocation.latitude},${capturedLocation.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Open in Maps
                </a>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Coordinates (copy):</span>
                <code className="bg-white px-2 py-1 rounded text-xs select-all">
                  {capturedLocation.latitude},{capturedLocation.longitude}
                </code>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Accuracy Status:</span>
                <span className={capturedLocation.accuracy <= 20 ? 'text-green-600 font-semibold' : 'text-yellow-600'}>
                  {capturedLocation.accuracy <= 20 ? 'Within Required Range ✓' : 'Outside Required Range'}
                </span>
              </div>
              <div className="mt-3 p-2 bg-white rounded">
                <p className="text-xs text-gray-500 mb-1">Raw JSON (for debugging):</p>
                <pre className="text-xs overflow-x-auto">
                  {JSON.stringify(capturedLocation, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {permissionDenied && (
        <div className="mt-6">
          <Alert variant="destructive">
            <AlertTitle>Permission Denied</AlertTitle>
            <AlertDescription>
              Location permission was denied. You'll need to enable it in your browser settings to join location-based communities.
            </AlertDescription>
          </Alert>
        </div>
      )}

      <div className="mt-8 p-4 bg-gray-50 rounded-lg">
        <h2 className="font-semibold mb-2">Component Features:</h2>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
          <li>Requests precise location permission</li>
          <li>Shows real-time GPS accuracy with visual indicators</li>
          <li>Displays location coordinates and metadata</li>
          <li>Handles permission denial gracefully</li>
          <li>Provides retry functionality for poor GPS accuracy</li>
          <li>Color-coded accuracy status (Excellent/Good/Fair/Poor)</li>
        </ul>
      </div>
    </div>
  );
};