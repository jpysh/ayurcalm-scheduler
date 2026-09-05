import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { MessageCircle, Calendar, Clock, User, MapPin, Flower2, Utensils, ChevronLeft, ChevronRight } from "lucide-react";
import { useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { API_BASE } from "@/lib/apiBase";

type ApiAppointment = { id: string; patient_id: string; therapy_id: string; staff_id: string; room_id: string; scheduled_date: string; start_time: string; duration_minutes: number };
type ApiPatient = { id: string; name: string };
type ApiStaff = { id: string; name: string };
type ApiTherapy = { id: string; name: string; duration_minutes: number };
type ApiRoom = { id: string; name: string; amenities: string[] };
type ApiDietPlan = { id: string; patient_id: string; date: string; meal_time: 'breakfast'|'lunch'|'dinner'|'snacks'; description: string; instructions?: string };

const PatientView = () => {
  const { token } = useParams();
  const [patient, setPatient] = useState<ApiPatient | null>(null);
  const [appointments, setAppointments] = useState<ApiAppointment[]>([]);
  const [dietPlans, setDietPlans] = useState<ApiDietPlan[]>([]);
  const [staff, setStaff] = useState<ApiStaff[]>([]);
  const [therapies, setTherapies] = useState<ApiTherapy[]>([]);
  const [rooms, setRooms] = useState<ApiRoom[]>([]);
  const [currentDate, setCurrentDate] = useState<string>(new Date().toISOString().slice(0,10));

  useEffect(() => {
    const load = async () => {
      const patientList: ApiPatient[] = await fetch(`${API_BASE}/patients`).then(r=>r.json()).catch(()=>[]);
      const p = patientList[0] || null;
      if (!p) return;
      setPatient(p);
      const appts: ApiAppointment[] = await fetch(`${API_BASE}/appointments?patient_id=${p.id}`).then(r=>r.json()).catch(()=>[]);
      setAppointments(appts);
      const dps: ApiDietPlan[] = await fetch(`${API_BASE}/dietplans?patient_id=${p.id}&date=${currentDate}`).then(r=>r.json()).catch(()=>[]);
      setDietPlans(dps);
      const [s, t, r] = await Promise.all([
        fetch(`${API_BASE}/staff`).then(res=>res.json()).catch(()=>[]),
        fetch(`${API_BASE}/therapies`).then(res=>res.json()).catch(()=>[]),
        fetch(`${API_BASE}/rooms`).then(res=>res.json()).catch(()=>[]),
      ]);
      setStaff(s);
      setTherapies(t);
      setRooms(r);
    };
    if (token) load();
  }, [token, currentDate]);

  const nameById = useMemo(() => ({
    staff: Object.fromEntries(staff.map(s=>[s.id,s.name])),
    therapy: Object.fromEntries(therapies.map(t=>[t.id,t.name])),
    room: Object.fromEntries(rooms.map(r=>[r.id,r.name])),
  }), [staff, therapies, rooms]);

  const handleContactCenter = () => {
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
              <h1 className="text-sm font-bold text-center md:text-left">Your Appointments</h1>
              <p className="text-xs text-muted-foreground text-center md:text-left">{patient?.name || "Patient"}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-2 py-3 max-w-3xl space-y-4">
        {/* Appointments Section */}
        <section>
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-1 justify-center md:justify-start">
            <Calendar className="w-4 h-4 text-primary" />
            Your Appointments
          </h2>
          <div className="flex items-center justify-center md:justify-start gap-1.5 mb-2">
            <Button variant="ghost" size="icon" aria-label="Prev day" onClick={() => {
              const d = new Date(currentDate);
              d.setDate(d.getDate() - 1);
              setCurrentDate(d.toISOString().slice(0,10));
            }}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium text-center md:text-left">
              {new Date(currentDate).toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </span>
            <Button variant="ghost" size="icon" aria-label="Next day" onClick={() => {
              const d = new Date(currentDate);
              d.setDate(d.getDate() + 1);
              setCurrentDate(d.toISOString().slice(0,10));
            }}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <div className="space-y-2">
            {(() => {
              const forDay = appointments.filter(a => new Date(a.scheduled_date).toISOString().slice(0,10) === currentDate);
              const upcoming = appointments.filter(a => new Date(a.scheduled_date) >= new Date(currentDate)).sort((a,b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime());
              const display = forDay.length ? forDay : upcoming.slice(0, 1);
              return display;
            })().map((appointment) => (
              <Card key={appointment.id} className="shadow-md min-h-[150px] border border-border/30">
                <CardHeader className="pb-2 pt-1">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between items-center">
                    <div>
                      <CardTitle className="text-base mb-0.5 text-center md:text-left">
                        {nameById.therapy[appointment.therapy_id] || appointment.therapy_id}
                      </CardTitle>
                      <Badge variant="secondary" className="text-sm px-2.5 py-0.5 mx-auto md:mx-0">
                        {new Date(appointment.scheduled_date).toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric" })}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-3 pt-0 space-y-1.5 md:text-left text-center">
                  <div className="flex items-center gap-2 justify-center md:justify-start">
                    <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="font-medium text-sm">Date:</span>
                    <span className="text-sm">{new Date(appointment.scheduled_date).toLocaleDateString('en-IN')}</span>
                  </div>
                  <div className="flex items-center gap-2 justify-center md:justify-start">
                    <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="font-medium text-sm">Time:</span>
                    <span className="text-sm">{appointment.start_time}</span>
                  </div>
                  <div className="flex items-center gap-2 justify-center md:justify-start">
                    <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="font-medium text-sm">Duration:</span>
                    <span className="text-sm">{appointment.duration_minutes} mins</span>
                  </div>
                  <div className="flex items-center gap-2 justify-center md:justify-start">
                    <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="font-medium text-sm">Therapist:</span>
                    <span className="text-sm">{nameById.staff[appointment.staff_id] || appointment.staff_id}</span>
                  </div>
                  <div className="flex items-center gap-2 justify-center md:justify-start">
                    <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="font-medium text-sm">Location:</span>
                    <span className="text-sm">{nameById.room[appointment.room_id] || appointment.room_id}</span>
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
            ))}
          </div>
        </section>

        <Separator className="my-8" />

        {/* Diet Plan Section */}
        <section>
          <h2 className="text-sm font-semibold mb-2 flex items-center gap-1 justify-center md:justify-start">
            <Utensils className="w-4 h-4 text-primary" />
            Your Diet Plan - Today
          </h2>
          <Card className="shadow-md border border-border/30">
            <CardContent className="pt-3">
              <div className="space-y-6">
                {(() => {
                  const samplePlans: ApiDietPlan[] = [
                    { id: "sample-1", patient_id: patient?.id || "", date: currentDate, meal_time: 'breakfast', description: 'Warm oatmeal with honey and almonds' },
                    { id: "sample-2", patient_id: patient?.id || "", date: currentDate, meal_time: 'lunch', description: 'Rice with dal, steamed vegetables, and ghee' },
                  ];
                  const list = dietPlans.length ? dietPlans : samplePlans;
                  return list;
                })().map((dp, index, arr) => (
                  <div key={dp.id || index} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Badge className="text-sm px-2.5 py-0.5">{dp.meal_time}</Badge>
                    </div>
                    <p className="text-sm font-medium pl-2">{dp.description}</p>
                    {dp.instructions && (
                      <p className="text-sm text-muted-foreground pl-2 italic">
                        {dp.instructions}
                      </p>
                    )}
                    {index < arr.length - 1 && (
                      <Separator className="mt-3" />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Contact Button */}
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border">
          <div className="container mx-auto px-2 py-1 max-w-3xl">
            <Button
              onClick={handleContactCenter}
              className="w-full h-10 text-sm font-medium truncate px-2"
            >
              <MessageCircle className="w-4 h-4 mr-2" />
              WhatsApp
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatientView;
