import { Router, type IRouter } from "express";
import healthRouter from "./health";
import newsRouter from "./news";
import contactsRouter from "./contacts";
import accountRouter from "./account";
import settingsRouter from "./settings";
import networkHealthRouter from "./networkHealth";
import notificationsRouter from "./notifications";
import feedbackRouter from "./feedback";
import featuresRouter from "./features";
import parseCardRouter from "./parseCard";
import parseLinkedInRouter from "./parseLinkedIn";
import suggestedMessageRouter from "./suggestedMessage";
import entitlementsRouter from "./entitlements";
import revenuecatRouter from "./revenuecat";
import storekitTestRouter from "./storekitTest";

const router: IRouter = Router();

router.use(healthRouter);
router.use(newsRouter);
router.use(contactsRouter);
router.use(accountRouter);
router.use(settingsRouter);
router.use(networkHealthRouter);
router.use(notificationsRouter);
router.use(feedbackRouter);
router.use(featuresRouter);
router.use(parseCardRouter);
router.use(parseLinkedInRouter);
router.use(suggestedMessageRouter);
router.use(entitlementsRouter);
router.use(revenuecatRouter);
// Local development only; answers 404 everywhere else (see the file header).
router.use(storekitTestRouter);

export default router;
