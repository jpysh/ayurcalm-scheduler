import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { FullPage, QuietLink } from "@/components/kit";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <FullPage title="That page isn't here" note="The link may be old or mistyped.">
      <QuietLink href="/" className="mt-4">Back to the day ›</QuietLink>
    </FullPage>
  );
};

export default NotFound;
