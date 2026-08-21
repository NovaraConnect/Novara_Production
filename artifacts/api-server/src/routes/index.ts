import { Router, type IRouter } from "express";
import healthRouter from "./health";
import linkedinRouter from "./linkedin";
import newsRouter from "./news";
import contactsRouter from "./contacts";
import settingsRouter from "./settings";
import notificationsRouter from "./notifications";
import feedbackRouter from "./feedback";

const router: IRouter = Router();

router.use(healthRouter);
router.use(linkedinRouter);
router.use(newsRouter);
router.use(contactsRouter);
router.use(settingsRouter);
router.use(notificationsRouter);
router.use(feedbackRouter);

export default router;
