import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Flower2, Calendar, Users, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-12">
        <div className="text-center space-y-6 max-w-3xl mx-auto">
          <div className="mx-auto bg-primary rounded-full p-6 w-24 h-24 flex items-center justify-center shadow-lg">
            <Flower2 className="w-12 h-12 text-primary-foreground" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold">AyurApp</h1>
          <p className="text-xl md:text-2xl text-muted-foreground">
            Ayurvedic Therapy Center Management System
          </p>
          <p className="text-lg text-muted-foreground">
            Streamlined appointment scheduling, staff management, and patient care coordination
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid md:grid-cols-3 gap-6 mt-16 max-w-5xl mx-auto">
          <Card className="text-center shadow-md hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="mx-auto bg-primary/10 rounded-full p-4 w-16 h-16 flex items-center justify-center mb-4">
                <Calendar className="w-8 h-8 text-primary" />
              </div>
              <CardTitle className="text-xl">Smart Scheduling</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-lg">
                Automated appointment scheduling with intelligent room and staff assignment
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="text-center shadow-md hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="mx-auto bg-primary/10 rounded-full p-4 w-16 h-16 flex items-center justify-center mb-4">
                <Users className="w-8 h-8 text-primary" />
              </div>
              <CardTitle className="text-xl">Staff Management</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-lg">
                Easy staff scheduling with specialization tracking and availability management
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="text-center shadow-md hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="mx-auto bg-primary/10 rounded-full p-4 w-16 h-16 flex items-center justify-center mb-4">
                <Sparkles className="w-8 h-8 text-primary" />
              </div>
              <CardTitle className="text-xl">Patient Care</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-lg">
                Comprehensive patient records, therapy tracking, and personalized diet plans
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        {/* CTA Section */}
        <div className="mt-16 text-center space-y-6">
          <Card className="max-w-2xl mx-auto shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl">Get Started</CardTitle>
              <CardDescription className="text-lg">
                Access the system based on your role
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                size="lg"
                className="w-full h-14 text-lg font-semibold"
                onClick={() => navigate("/login")}
              >
                Admin Login
              </Button>
              <p className="text-base text-muted-foreground">
                Staff and patients can access their schedules via secure links sent by the admin
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Index;
