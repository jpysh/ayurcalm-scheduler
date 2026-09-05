import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const Settings = () => {
  return (
    <div className="min-h-screen bg-muted/30">
      <div className="container mx-auto px-3 md:px-4 py-3 md:py-6">
        <Card>
          <CardHeader className="px-2 md:px-4 pt-2 md:pt-4 pb-1 md:pb-2">
            <div className="flex items-center justify-center">
              <CardTitle className="text-base md:text-xl font-semibold">Center Settings</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-0 p-2">
            <div className="grid gap-2">
              <Button className="h-9">Coming Soon</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Settings;
