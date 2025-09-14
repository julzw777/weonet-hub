import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Router, 
  Wifi, 
  Server, 
  Activity, 
  MapPin, 
  Clock,
  Plus,
  RefreshCw
} from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { mockNetworkDevices } from "@/lib/mock-data";

const deviceIcons = {
  router: Router,
  switch: Server,
  ap: Wifi,
  olt: Server,
  onu: Server
};

export default function Network() {
  const onlineDevices = mockNetworkDevices.filter(d => d.status === 'online').length;
  const warningDevices = mockNetworkDevices.filter(d => d.status === 'warning').length;
  const offlineDevices = mockNetworkDevices.filter(d => d.status === 'offline').length;
  const avgUptime = mockNetworkDevices.reduce((sum, d) => sum + d.uptime, 0) / mockNetworkDevices.length;

  const getUptimeColor = (uptime: number) => {
    if (uptime >= 99) return 'success';
    if (uptime >= 95) return 'warning';
    return 'destructive';
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Network Operations Center</h1>
          <p className="text-muted-foreground">Monitor network infrastructure and device health</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Device
          </Button>
        </div>
      </div>

      {/* Network Summary */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-success">{onlineDevices}</div>
                <p className="text-xs text-muted-foreground">Online Devices</p>
              </div>
              <Activity className="h-8 w-8 text-success" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-warning">{warningDevices}</div>
                <p className="text-xs text-muted-foreground">Warning Devices</p>
              </div>
              <Activity className="h-8 w-8 text-warning" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-destructive">{offlineDevices}</div>
                <p className="text-xs text-muted-foreground">Offline Devices</p>
              </div>
              <Activity className="h-8 w-8 text-destructive" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{avgUptime.toFixed(1)}%</div>
                <p className="text-xs text-muted-foreground">Average Uptime</p>
              </div>
              <Clock className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Device List */}
      <Card>
        <CardHeader>
          <CardTitle>Network Devices</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {mockNetworkDevices.map((device) => {
              const DeviceIcon = deviceIcons[device.type];
              
              return (
                <div key={device.id} className="border border-border rounded-lg p-4 hover:bg-accent/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-muted rounded-lg">
                        <DeviceIcon className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div>
                        <h4 className="font-medium">{device.name}</h4>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                          <MapPin className="h-4 w-4" />
                          {device.location}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          <Badge variant="outline" className="text-xs">
                            {device.type.toUpperCase()}
                          </Badge>
                          <span>Last seen: {new Date(device.lastSeen).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">Uptime:</span>
                          <Badge variant={getUptimeColor(device.uptime)}>
                            {device.uptime}%
                          </Badge>
                        </div>
                      </div>
                      <StatusBadge status={device.status} />
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">View</Button>
                        <Button variant="outline" size="sm">Config</Button>
                        {device.status === 'offline' && (
                          <Button variant="destructive" size="sm">Ping</Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Network Map Placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>Network Topology</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 bg-muted rounded-lg flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <Server className="h-12 w-12 mx-auto mb-2" />
              <p>Network topology visualization would be displayed here</p>
              <p className="text-sm">Integration with network mapping tools</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}