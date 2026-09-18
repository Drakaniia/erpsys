limit upload size of attachment in students.

outside org should be also able to login using google, but they wil redirerct to fillup steps like student id, and a warning modal or something that indicate this acvcont is outside the organization

RESOLVED (2026-08-23): instructor logout/inactivity auto-close. Logout clears the instructor's own
availability immediately; inactivity auto-clears it after 60 min with a "Still there?" prompt at
T-5 min and a server-side timeout backstop. Scope = per-instructor availability only; queued students
stay; notice on next visit. Full design in instructor-page-spec.md §6.2 + §11.11.

forgot password shuold contact offier or admin, not email

settings page in student, sbo officer, instructor (in the profile click popup)

after succes enroll, clear uploaded photo

email or student id input

the question mark modal beside the bell icon, is not shoinwg (i htink its a shortcuts modal rpeview) in sbo officer page or if there is in instructor page

for those finished, what ui when they login in student page.

what if i click sbo officer gate, but my insti account is student, is there ui modal for it or soemthing?s, similar to the when im student but i click instructor when login in with google or email, how can we handle that after it login, what ui what..

in the sbo officer page when i click step 2-5 (when there is image proof), some image is not fit in the right popup side making the image not full load, and i want to add feature also that when i click that image, it will full screen view, and click again go to right sidebar, will that work?

add another opeoin in file upload in step 2-5 (external link), ass fallback for the file upload

any conerns about the upload (directly message sbo page)

remove mugshot camera open in the officer

add feature that can exit the queue, in student page

bug in instructor paage, when i click assign or unasign. the navigation tabs gets white and not clickable.. (reappearing tabs bug when i assign.. what is the ui solution foro this..)

also there is no undo for the instructor page for the student tthey enroll.. (how to ui solve this)

and im confused, whats the procees in the queing in the instructor page, why i can enroll students that are still in the queue and not yet serving (theres an enroll button). i thought that button should be serve, so it can now be on the firt in the queuee, and only then the student can offically mark as enrolled when their in the serving area

in student page - all steps complete but the indicator is still (5/6), and the progress is still not full,, also theres no ui when i login again, or when im officilly enrolled for succes modal or somehting..

how can we handle hundred of students at the same time for example while queueing

resume "add feature in step 6 in students. to be able to leave the queue, with apple design modal confirmation.." add the leave confirmation dialog before ToastStack. First let me find the exact anchor:
