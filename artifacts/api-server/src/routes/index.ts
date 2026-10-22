import { Router, type IRouter } from "express";
import healthRouter from "./health";
import newsRouter from "./news";
import contactsRouter from "./contacts";
import accountRouter from "./account";
import settingsRouter from "./settings";
import notificationsRouter from "./notifications";
import feedbackRouter from "./feedback";
import featuresRouter from "./features";
import parseCardRouter from "./parseCard";
import parseLinkedInRouter from "./parseLinkedIn";
import universityRouter from "./university";

const router: IRouter = Router();

router.use(healthRouter);
router.use(newsRouter);
router.use(contactsRouter);
router.use(accountRouter);
router.use(settingsRouter);
router.use(notificationsRouter);
router.use(feedbackRouter);
router.use(featuresRouter);
router.use(parseCardRouter);
router.use(parseLinkedInRouter);
// University access. Every route is behind UNIVERSITY_ACCESS_ENABLED (404 when off).
router.use(universityRouter);

export default router;
