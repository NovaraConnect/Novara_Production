import { Router, type IRouter } from "express";
import healthRouter from "./health";
import newsRouter from "./news";
import contactsRouter from "./contacts";
import settingsRouter from "./settings";
import notificationsRouter from "./notifications";
import feedbackRouter from "./feedback";
import featuresRouter from "./features";
import parseCardRouter from "./parseCard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(newsRouter);
router.use(contactsRouter);
router.use(settingsRouter);
router.use(notificationsRouter);
router.use(feedbackRouter);
router.use(featuresRouter);
router.use(parseCardRouter);

export default router;
