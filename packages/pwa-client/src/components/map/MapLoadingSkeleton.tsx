import { Skeleton } from '@/components/ui/skeleton';
import { MapPin } from 'lucide-react';

export function MapLoadingSkeleton() {
  return (
    <div className="h-[50vh] md:h-96 relative bg-muted rounded-lg overflow-hidden flex items-center justify-center">
      <div className="absolute inset-0">
        <Skeleton className="w-full h-full" />
      </div>
      <div className="relative z-10 flex flex-col items-center gap-3 text-muted-foreground">
        <MapPin className="h-12 w-12 animate-pulse" />
        <p className="text-sm font-medium">Loading map...</p>
      </div>
    </div>
  );
}
