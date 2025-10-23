import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Download, Printer, MapPin, Zap, ArrowLeft, AlertTriangle } from 'lucide-react';

const VALIDATION_SERVICE_URL = import.meta.env.VITE_VALIDATION_SERVICE_URL || (
  import.meta.env.MODE === 'production' ? 'https://api.peek.verse.app' : 'http://localhost:3001'
);

export default function CreateSticker() {
  const navigate = useNavigate();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateSticker = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${VALIDATION_SERVICE_URL}/api/sticker`);

      if (!response.ok) {
        throw new Error('Failed to generate sticker');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setImageUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const downloadSticker = () => {
    if (!imageUrl) return;

    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `peek-sticker-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const printSticker = () => {
    if (!imageUrl) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print Peek Sticker</title>
          <style>
            body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body><img src="${imageUrl}" alt="Peek QR Sticker" style="max-width: 6in;" /></body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="min-h-screen bg-cover bg-center" style={{ backgroundImage: 'url(/sticker-wall.jpg)' }}>
      {/* Header */}
      <header className="bg-card/90 backdrop-blur shadow-md border-b-2 border-coral/20 sticky top-0 z-50">
        <div className="container mx-auto px-3 sm:px-4 py-3">
          <div className="flex items-center gap-4">
            <Button
              onClick={() => navigate('/')}
              variant="ghost"
              size="sm"
              className="hover:bg-coral/10"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl sm:text-2xl font-rubik font-bold">Create QR Sticker</h1>
              <p className="text-sm text-muted-foreground hidden sm:block">Generate a location-based community</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-4xl bg-white border-[3px] border-solid border-black" style={{ borderRadius: 0 }}>
        {/* Alpha Warning */}
        <Alert className="mb-8 border-yellow-500/50 bg-yellow-500/10">
          <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
          <AlertDescription className="text-sm">
            <strong>Alpha Release:</strong> Peek is in early testing. Communities may be reset or deleted as we improve the platform. Use for testing purposes only.
          </AlertDescription>
        </Alert>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Instructions */}
          <div className="space-y-6">
            <Card className="bg-card border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-coral" />
                  How Peek Works
                </CardTitle>
                <CardDescription>
                  Create hyperlocal communities through physical QR codes
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-coral text-white flex items-center justify-center font-bold">1</div>
                  <div>
                    <h3 className="font-semibold mb-1">Generate QR Code</h3>
                    <p className="text-sm text-muted-foreground">
                      Click the button to create a unique QR code sticker
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-coral text-white flex items-center justify-center font-bold">2</div>
                  <div>
                    <h3 className="font-semibold mb-1">Print & Place</h3>
                    <p className="text-sm text-muted-foreground">
                      Download the SVG and print it as a sticker. Place it at your location (café, park, event, etc.)
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-coral text-white flex items-center justify-center font-bold">3</div>
                  <div>
                    <h3 className="font-semibold mb-1">First Scan Creates</h3>
                    <p className="text-sm text-muted-foreground">
                      The first person to scan establishes the community and becomes the founding admin
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-coral text-white flex items-center justify-center font-bold">4</div>
                  <div>
                    <h3 className="font-semibold mb-1">Others Join</h3>
                    <p className="text-sm text-muted-foreground">
                      Subsequent scanners must prove they're at the location (GPS within 25m) to join
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Alert className="border-mint/30 bg-mint/10">
              <Zap className="h-4 w-4 text-mint" />
              <AlertDescription>
                <strong>Pro tip:</strong> You can place more than one copy if needed to make the QR code easier to find at your location.
              </AlertDescription>
            </Alert>
          </div>

          {/* Generator */}
          <div className="space-y-4">
            <Card className="bg-card border-0 shadow-lg">
              <CardHeader>
                <CardTitle>Generate Your Sticker</CardTitle>
                <CardDescription>
                  Creates a unique QR code for a new Peek community
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!imageUrl ? (
                  <Button
                    onClick={generateSticker}
                    disabled={loading}
                    className="w-full bg-coral hover:bg-coral/90 text-white font-semibold py-6 text-lg"
                    size="lg"
                  >
                    {loading ? 'Generating...' : 'Generate QR Sticker'}
                  </Button>
                ) : (
                  <>
                    <div className="border-2 border-coral/20 rounded-lg p-4 bg-white">
                      <div
                        className="mx-auto"
                        style={{ width: '100%', maxWidth: '350px' }}
                      >
                        <img src={imageUrl} alt="Peek QR Sticker" className="w-full h-auto" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        onClick={downloadSticker}
                        variant="outline"
                        className="gap-2 border-coral/30 hover:bg-coral/10"
                      >
                        <Download className="h-4 w-4" />
                        Download PNG
                      </Button>
                      <Button
                        onClick={printSticker}
                        variant="outline"
                        className="gap-2 border-coral/30 hover:bg-coral/10"
                      >
                        <Printer className="h-4 w-4" />
                        Print
                      </Button>
                    </div>

                    <Button
                      onClick={generateSticker}
                      variant="ghost"
                      className="w-full"
                    >
                      Generate Another
                    </Button>
                  </>
                )}

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground text-center">
              Each QR code is unique and creates a separate community
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
