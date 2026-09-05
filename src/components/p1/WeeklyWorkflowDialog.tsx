import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarDays, Users, Home, Sparkles, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface WeeklyWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const WeeklyWorkflowDialog = ({ open, onOpenChange }: WeeklyWorkflowDialogProps) => {
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [checkedItems, setCheckedItems] = useState({
    staffLeaves: false,
    roomMaintenance: false,
    centerHolidays: false,
    reviewMessages: false,
    newAppointments: false,
  });

  const workflowSteps = [
    {
      step: 1,
      title: "Select Week",
      icon: CalendarDays,
      description: "Choose the Monday start date for next week's schedule",
    },
    {
      step: 2,
      title: "Pre-Schedule Checklist",
      icon: CheckCircle2,
      description: "Complete these tasks before running auto-assign",
    },
    {
      step: 3,
      title: "Review & Generate",
      icon: Sparkles,
      description: "Review inputs and generate the weekly schedule",
    },
  ];

  const handleChecklistToggle = (key: keyof typeof checkedItems) => {
    setCheckedItems((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const allChecked = Object.values(checkedItems).every((v) => v);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Weekly Scheduling Workflow</DialogTitle>
          <p className="text-lg text-muted-foreground">Saturday Preparation for Monday Start</p>
        </DialogHeader>

        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Badge className="text-base px-3 py-1">1. Select Week</Badge>
            <Badge className="text-base px-3 py-1">2. Pre-Schedule Checklist</Badge>
            <Badge className="text-base px-3 py-1">3. Review & Generate</Badge>
          </div>
        </div>

        {/* Step Content */}
        <div className="space-y-6">
          <div className="space-y-4">
            <div>
              <Label className="text-xl mb-4 block">Select Monday Start Date</Label>
              <p className="text-lg text-muted-foreground mb-4">
                Choose the Monday that starts the week you want to schedule
              </p>
            </div>
            <div className="flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                disabled={(date) => date.getDay() !== 1 || date < new Date()}
                className="rounded-md border pointer-events-auto"
              />
            </div>
            {selectedDate && (
              <Card className="bg-primary/10">
                <CardContent className="p-4">
                  <p className="text-lg font-semibold">
                    Week of {selectedDate.toLocaleDateString("en-IN", { month: "long", day: "numeric", year: "numeric" })}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
              <div>
                <Label className="text-xl mb-4 block">Complete Checklist</Label>
                <p className="text-lg text-muted-foreground mb-4">
                  Ensure all information is up-to-date before generating the schedule
                </p>
              </div>

              <div className="space-y-4">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <Checkbox
                        id="staffLeaves"
                        checked={checkedItems.staffLeaves}
                        onCheckedChange={() => handleChecklistToggle("staffLeaves")}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <Label htmlFor="staffLeaves" className="text-lg font-semibold cursor-pointer flex items-center gap-2">
                          <Users className="w-5 h-5" />
                          Update Staff Leaves & Availability
                        </Label>
                        <p className="text-muted-foreground mt-1">
                          Review and add any staff time off or leave requests for next week
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <Checkbox
                        id="roomMaintenance"
                        checked={checkedItems.roomMaintenance}
                        onCheckedChange={() => handleChecklistToggle("roomMaintenance")}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <Label htmlFor="roomMaintenance" className="text-lg font-semibold cursor-pointer flex items-center gap-2">
                          <Home className="w-5 h-5" />
                          Check Room Maintenance Schedule
                        </Label>
                        <p className="text-muted-foreground mt-1">
                          Mark any rooms unavailable due to maintenance or cleaning
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <Checkbox
                        id="centerHolidays"
                        checked={checkedItems.centerHolidays}
                        onCheckedChange={() => handleChecklistToggle("centerHolidays")}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <Label htmlFor="centerHolidays" className="text-lg font-semibold cursor-pointer flex items-center gap-2">
                          <CalendarDays className="w-5 h-5" />
                          Confirm Center Closure Days
                        </Label>
                        <p className="text-muted-foreground mt-1">
                          Verify any center-wide time off or special closures
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <Checkbox
                        id="reviewMessages"
                        checked={checkedItems.reviewMessages}
                        onCheckedChange={() => handleChecklistToggle("reviewMessages")}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <Label htmlFor="reviewMessages" className="text-lg font-semibold cursor-pointer">
                          Review WhatsApp Reschedule Requests
                        </Label>
                        <p className="text-muted-foreground mt-1">
                          Process any pending reschedule or cancellation requests
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <Checkbox
                        id="newAppointments"
                        checked={checkedItems.newAppointments}
                        onCheckedChange={() => handleChecklistToggle("newAppointments")}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <Label htmlFor="newAppointments" className="text-lg font-semibold cursor-pointer">
                          Input New Patient Appointments
                        </Label>
                        <p className="text-muted-foreground mt-1">
                          Enter all new appointments received during the week
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

          <div className="space-y-6">
              <div>
                <Label className="text-xl mb-4 block">Review & Generate Schedule</Label>
                <p className="text-lg text-muted-foreground mb-4">
                  Review your inputs and generate the weekly schedule
                </p>
              </div>

              <Card className="bg-muted">
                <CardContent className="p-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-medium">Week Starting:</span>
                    <Badge variant="default" className="text-base px-4 py-2">
                      {selectedDate?.toLocaleDateString("en-IN", { month: "long", day: "numeric", year: "numeric" })}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-medium">Checklist Completed:</span>
                    <Badge variant={allChecked ? "default" : "secondary"} className="text-base px-4 py-2">
                      {allChecked ? "✓ All Items" : "Incomplete"}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-medium">Ready to Generate:</span>
                    <Badge variant={selectedDate && allChecked ? "default" : "secondary"} className="text-base px-4 py-2">
                      {selectedDate && allChecked ? "Yes" : "No"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-primary/50 bg-primary/5">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <Sparkles className="w-6 h-6 text-primary mt-1" />
                    <div>
                      <p className="text-lg font-semibold mb-2">What Happens Next?</p>
                      <ul className="space-y-2 text-muted-foreground">
                        <li>• System will auto-assign appointments to staff and rooms</li>
                        <li>• Conflict resolution based on availability and constraints</li>
                        <li>• WhatsApp confirmations sent to all patients automatically</li>
                        <li>• Staff schedules updated and accessible via their links</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

        <div className="flex justify-end pt-6 border-t">
          <Button
            size="lg"
            onClick={() => {
              onOpenChange(false);
              setCheckedItems({
                staffLeaves: false,
                roomMaintenance: false,
                centerHolidays: false,
                reviewMessages: false,
                newAppointments: false,
              });
            }}
            disabled={!selectedDate || !allChecked}
            className="h-14 px-8 text-lg"
          >
            <Sparkles className="w-5 h-5 mr-2" />
            Generate Schedule
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
