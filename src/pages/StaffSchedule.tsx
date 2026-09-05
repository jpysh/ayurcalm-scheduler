import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Clock, MapPin, User, Flower2, ChevronLeft, ChevronRight } from "lucide-react";
import { useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { API_BASE } from "@/lib/apiBase";

type ApiAppointment = { id: string; patient_id: string; therapy_id: string; staff_id: string; room_id: string; scheduled_date: string; start_time: string; duration_minutes: number };
type ApiStaff = { id: string; name: string };
type ApiPatient = { id: string; name: string };
type ApiTherapy = { id: string; name: string; duration_minutes: number };
type ApiRoom = { id: string; name: string; amenities: string[] };

const StaffSchedule = () => {
  const { token } = useParams();
  const [staff, setStaff] = useState<ApiStaff | null>(null);
  const [appointments, setAppointments] = useState<ApiAppointment[]>([]);
  const [patients, setPatients] = useState<ApiPatient[]>([]);
  const [therapies, setTherapies] = useState<ApiTherapy[]>([]);
  const [rooms, setRooms] = useState<ApiRoom[]>([]);
  const [currentDate, setCurrentDate] = useState<string>(new Date().toISOString().slice(0,10));

  useEffect(() => {
    const load = async () => {
      const staffList: ApiStaff[] = await fetch(`${API_BASE}/staff`).then(r=>r.json()).catch(()=>[]);
      const s = staffList[0] || null;
      if (!s) return;
      setStaff(s);
      const appts: ApiAppointment[] = await fetch(`${API_BASE}/appointments?date=${currentDate}&staff_id=${s.id}`).then(r=>r.json()).catch(()=>[]);
      setAppointments(appts);
      const [p, t, r] = await Promise.all([
        fetch(`${API_BASE}/patients`).then(res=>res.json()).catch(()=>[]),
        fetch(`${API_BASE}/therapies`).then(res=>res.json()).catch(()=>[]),
        fetch(`${API_BASE}/rooms`).then(res=>res.json()).catch(()=>[]),
      ]);
      setPatients(p);
      setTherapies(t);
      setRooms(r);
    };
    if (token) load();
  }, [token, currentDate]);

  const nameById = useMemo(() => ({
    patient: Object.fromEntries(patients.map(p=>[p.id,p.name])),
    therapy: Object.fromEntries(therapies.map(t=>[t.id,t.name])),
    room: Object.fromEntries(rooms.map(r=>[r.id,r.name])),
  }), [patients, therapies, rooms]);

  const handleContactAdmin = () => {
    window.open("https://wa.me/", "_blank");
  };

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-card border-b border-border">
        <div className="container mx-auto px-2 py-1.5">
          <div className="flex items-center gap-3 justify-center md:justify-start">
            <div className="bg-primary rounded-full p-2">
              <Flower2 className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-center md:text-left">Your Schedule</h1>
              <p className="text-xs text-muted-foreground text-center md:text-left">{staff?.name || "Staff"}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-2 py-3 max-w-3xl">
        <div className="space-y-3">
          {/* Current Date with navigation */}
          <div className="flex items-center justify-center md:justify-start gap-1.5">
            <Button variant="ghost" size="icon" aria-label="Prev day" onClick={() => {
              const d = new Date(currentDate);
              d.setDate(d.getDate() - 1);
              setCurrentDate(d.toISOString().slice(0,10));
            }}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <h2 className="text-sm font-medium text-center md:text-left">
              {new Date(currentDate).toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </h2>
            <Button variant="ghost" size="icon" aria-label="Next day" onClick={() => {
              const d = new Date(currentDate);
              d.setDate(d.getDate() + 1);
              setCurrentDate(d.toISOString().slice(0,10));
            }}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Schedule Cards */}
          <div className="space-y-2">
            {appointments.length > 0 ? (
              appointments.map((appointment) => (
                <Card key={appointment.id} className="shadow-md hover:shadow-lg transition-shadow min-h-[120px] border border-border/30">
                  <CardHeader className="pb-2 pt-1">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between items-center">
                      <CardTitle className="text-base text-center md:text-left mb-0.5">{nameById.therapy[appointment.therapy_id] || appointment.therapy_id}</CardTitle>
                      <Badge variant="secondary" className="text-sm px-3 py-0.5 mt-1 md:mt-0">
                        <Clock className="w-4 h-4 mr-2" />
                        {appointment.start_time}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 space-y-1.5 md:text-left text-center">
                    <div className="flex items-center justify-center md:justify-start gap-2 text-sm">
                      <User className="w-5 h-5 text-muted-foreground" />
                      <span className="font-medium">Patient:</span>
                      <span>{nameById.patient[appointment.patient_id] || appointment.patient_id}</span>
                    </div>
                    <div className="flex items-center justify-center md:justify-start gap-2 text-sm">
                      <MapPin className="w-5 h-5 text-muted-foreground" />
                      <span className="font-medium">Location:</span>
                      <span>{nameById.room[appointment.room_id] || appointment.room_id}</span>
                    </div>
                    <div className="flex items-center justify-center md:justify-start gap-2 text-sm">
                      <Clock className="w-5 h-5 text-muted-foreground" />
                      <span className="font-medium">Duration:</span>
                      <span>{appointment.duration_minutes} mins</span>
                    </div>
                    <div className="text-sm md:text-left text-center">
                      <span className="font-medium">Amenities:</span>
                      <div className="flex flex-wrap gap-1 mt-1 justify-center md:justify-start">
                        {(rooms.find(r=>r.id===appointment.room_id)?.amenities || []).map((a, i) => (
                          <Badge key={i} variant="outline" className="px-2 py-0.5 text-xs">{a}</Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card className="text-center py-12">
                <CardContent>
                  <p className="text-base text-muted-foreground">
                    No appointments scheduled for today
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Contact Admin Button */}
          <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border">
            <div className="container mx-auto px-2 py-1 max-w-3xl">
              <Button
                onClick={handleContactAdmin}
                className="w-full h-10 text-sm font-medium truncate px-2"
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                WhatsApp Admin
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StaffSchedule;
