export function roleLabel(role: string | undefined | null): string {
  switch (role) {
    case "SBO_OFFICER":
      return "SBO Officer";
    case "ENROLLMENT_ADVISER":
      return "Instructor";
    case "ADMIN":
      return "Admin";
    default:
      return "Student";
  }
}
