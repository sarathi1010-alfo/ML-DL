"""BERT proxy: TF-IDF (word+char ngrams) + LogReg for complaint classification.

No transformers. Also implements sentiment (keyword+negation), urgency
(intensity words), and a simple regex entity extractor.
"""
from __future__ import annotations
import re
import time
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score

from ..core.logging import logger
from .model_registry import save_artifact, load_artifact


CATEGORIES = ["Technical", "Billing", "General", "Network"]


# Sentence templates per category
_TEMPLATES = {
    "Technical": [
        "my internet is not working", "the app keeps crashing", "i cannot log in",
        "my computer is slow", "the system is frozen", "i get an error message",
        "my password reset fails", "the page won't load", "the software is broken",
        "my vpn is not connecting", "the database is down", "the api returns 500",
        "my screen is flickering", "the printer is offline", "my emails won't sync",
        "the deployment failed", "my code throws an exception", "the server is unreachable",
        "i cannot upload files", "the cache is corrupted", "my session timed out",
        "the backup is failing", "the certificate expired", "my microphone is not detected",
        "the video keeps buffering", "i cannot save changes", "the dashboard is blank",
        "my keyboard is unresponsive", "the file is corrupted", "the plugin is incompatible",
        "i cannot install the update", "the integration is broken", "the webhook is timing out",
        "my download is stuck", "the configuration is invalid", "my account is locked out",
        "the cron job did not run", "my browser is freezing", "the schema mismatch error",
        "i cannot access the console",
    ],
    "Billing": [
        "i was charged twice", "my invoice is wrong", "i want a refund",
        "the payment failed", "i was overcharged", "i cannot update my card",
        "my subscription renewed unexpectedly", "the price is too high", "i need a billing statement",
        "where is my receipt", "the discount was not applied", "i was billed after cancellation",
        "my credit card expired", "the tax calculation is wrong", "i want to change my plan",
        "the proration looks incorrect", "i did not authorize this charge", "the coupon code is invalid",
        "i need an invoice copy", "the refund is delayed", "my bank declined the charge",
        "i was billed for a free trial", "the auto-renewal should be off", "i cannot download the invoice",
        "the currency conversion is wrong", "my payment method was removed", "i was double billed",
        "the late fee is unfair", "i want to dispute a charge", "the billing cycle is confusing",
        "my receipt shows the wrong amount", "the vat number is missing", "i need to update billing address",
        "the installment plan failed", "my refund was partial", "i want to cancel my subscription",
        "the charge looks fraudulent", "the statement does not match", "my promo code expired",
        "i need a payment receipt",
    ],
    "General": [
        "hello i have a question", "how do i contact support", "i need help with my account",
        "what are your hours", "where is the faq", "i want to speak to a manager",
        "can someone call me back", "thank you for the help", "i have a suggestion",
        "how do i update my profile", "where can i find documentation", "i want to leave feedback",
        "the website is confusing", "i cannot find what i need", "is there a phone number",
        "how do i close my account", "i want to file a complaint", "the chat is not answered",
        "i am very happy with the service", "this is excellent", "i am disappointed",
        "the agent was helpful", "i need more information", "how do i change my email",
        "i cannot reach anyone", "where is the office located", "i want to upgrade",
        "the onboarding was great", "i am confused about the policy", "what is the refund policy",
        "i want to speak to a human", "the faq did not help", "i need to verify my identity",
        "how do i reset my security questions", "i want to give a compliment", "the support was slow",
        "i am unsure what to do next", "where do i submit documents", "i want to escalate this",
        "is there a community forum", "i am new here",
    ],
    "Network": [
        "the wifi keeps dropping", "my connection is very slow", "the latency is too high",
        "i have packet loss", "the router is not responding", "my ethernet is down",
        "the dns is not resolving", "the signal is weak", "i cannot reach the gateway",
        "the vpn keeps disconnecting", "the bandwidth is low", "my latency spikes",
        "the network is unstable", "i have no internet at all", "the connection times out",
        "my ping is 500ms", "the upload speed is terrible", "the download speed is slow",
        "the fiber link is down", "the switch is faulty", "i have intermittent drops",
        "the access point is offline", "the mesh network is broken", "my mobile data is slow",
        "the routing is wrong", "the firewall blocks me", "the port is closed",
        "the ip address conflicts", "the subnet mask is wrong", "the dhcp is not assigning",
        "the traceroute shows loops", "the jitter is unacceptable", "my 5ghz network is gone",
        "the channel is congested", "the modem reboots itself", "the optical link is degraded",
        "the bgp route is flapping", "the bandwidth is throttled", "my hotspot disconnects",
        "the carrier signal is weak",
    ],
}

# Sentiment lexicon
_NEG_WORDS = {"not", "no", "never", "cannot", "can't", "won't", "don't", "doesn't",
              "didn't", "isn't", "wasn't", "aren't", "weren't", "without", "fail",
              "broken", "down", "slow", "stuck", "frozen", "unreachable", "crash"}
_POS_WORDS = {"good", "great", "excellent", "happy", "helpful", "perfect", "amazing",
              "wonderful", "fantastic", "satisfied", "thanks", "thank"}
_NEG_INTENSITY = {"angry", "frustrated", "terrible", "horrible", "worst", "awful",
                  "unacceptable", "broken", "down", "critical", "urgent", "immediately",
                  "emergency", "fail", "fail", "stuck", "frozen"}

_ISSUE_KEYWORDS = {
    "internet", "wifi", "router", "vpn", "network", "connection", "email", "app",
    "password", "login", "billing", "invoice", "payment", "refund", "charge",
    "computer", "server", "database", "api", "software", "system", "page", "code",
    "deployment", "certificate", "firewall", "dns", "latency", "bandwidth", "speed",
}


class BertService:
    MODEL_NAME = "BERT (TF-IDF + LogReg deployment proxy)"

    def __init__(self) -> None:
        cached = load_artifact("bert_model")
        if cached and all(k in cached for k in ("word_vec", "char_vec", "clf", "accuracy", "f1")):
            self.word_vec = cached["word_vec"]
            self.char_vec = cached["char_vec"]
            self.clf = cached["clf"]
            self.accuracy = cached["accuracy"]
            self.f1 = cached["f1"]
            logger.info("Loaded bert proxy model from disk cache.")
            return
        self._train()
        save_artifact("bert_model", {
            "word_vec": self.word_vec,
            "char_vec": self.char_vec,
            "clf": self.clf,
            "accuracy": self.accuracy,
            "f1": self.f1,
        })

    def _build_corpus(self) -> tuple[list[str], list[str]]:
        texts, labels = [], []
        for cat, templates in _TEMPLATES.items():
            for t in templates:
                texts.append(t)
                labels.append(cat)
        # Augment with a few random variations
        rng = np.random.default_rng(123)
        prefixes = ["hi, ", "hello, ", "please help: ", "urgent: ", "", "", ""]
        suffixes = [" thanks", " please help", " asap", " it is frustrating", "", "", ""]
        aug_texts, aug_labels = [], []
        for t, l in zip(texts, labels):
            aug_texts.append(t)
            aug_labels.append(l)
            for _ in range(2):
                aug_texts.append(rng.choice(prefixes) + t + rng.choice(suffixes))
                aug_labels.append(l)
        return aug_texts, aug_labels

    def _train(self) -> None:
        texts, labels = self._build_corpus()
        self.word_vec = TfidfVectorizer(max_features=3000, ngram_range=(1, 2), sublinear_tf=True)
        self.char_vec = TfidfVectorizer(max_features=2000, analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True)
        Xw = self.word_vec.fit_transform(texts)
        Xc = self.char_vec.fit_transform(texts)
        from scipy.sparse import hstack
        X = hstack([Xw, Xc])
        self.clf = LogisticRegression(max_iter=400, C=2.0, random_state=42)
        X_train, X_test, y_train, y_test = train_test_split(X, labels, test_size=0.2, random_state=42, stratify=labels)
        self.clf.fit(X_train, y_train)
        preds = self.clf.predict(X_test)
        self.accuracy = float(accuracy_score(y_test, preds))
        self.f1 = float(f1_score(y_test, preds, average="weighted"))
        logger.info(f"Bert proxy trained: acc={self.accuracy:.3f}, f1={self.f1:.3f}")

    def _sentiment(self, text: str) -> tuple[str, float]:
        tokens = re.findall(r"[a-z']+", text.lower())
        if not tokens:
            return "Neutral", 0.5
        neg = sum(1 for t in tokens if t in _NEG_WORDS)
        pos = sum(1 for t in tokens if t in _POS_WORDS)
        # Account for negation: if neg>0 reduce positive count
        effective_pos = max(0, pos - neg)
        total = neg + effective_pos
        if total == 0:
            return "Neutral", 0.5
        if neg > effective_pos:
            score = 0.5 + min(0.45, neg * 0.12)
            return "Negative", round(score, 2)
        if effective_pos > neg:
            score = 0.5 + min(0.45, effective_pos * 0.12)
            return "Positive", round(score, 2)
        return "Neutral", 0.5

    def _urgency(self, text: str) -> str:
        tokens = set(re.findall(r"[a-z']+", text.lower()))
        hits = sum(1 for t in tokens if t in _NEG_INTENSITY)
        excl = text.count("!")
        if hits >= 3 or (hits >= 2 and excl >= 1) or excl >= 2:
            return "High"
        if hits >= 1:
            return "Medium"
        return "Low"

    def _entities(self, text: str) -> list[dict]:
        tokens = re.findall(r"[a-zA-Z]{3,}", text.lower())
        seen = set()
        out = []
        for t in tokens:
            if t in _ISSUE_KEYWORDS and t not in seen:
                seen.add(t)
                out.append({"text": t, "type": "ISSUE"})
        # Regex for account numbers / order ids
        for m in re.finditer(r"\b[A-Z]{2,4}-?\d{3,6}\b", text):
            out.append({"text": m.group(0), "type": "ACCOUNT_ID"})
        return out[:6]

    def predict(self, text: str) -> dict:
        t0 = time.perf_counter()
        Xw = self.word_vec.transform([text])
        Xc = self.char_vec.transform([text])
        from scipy.sparse import hstack
        X = hstack([Xw, Xc])
        proba = self.clf.predict_proba(X)[0]
        classes = self.clf.classes_.tolist()
        idx = int(np.argmax(proba))
        category = classes[idx]
        confidence = float(round(proba[idx], 3))
        categories = [
            {"label": c, "score": float(round(p, 3))}
            for c, p in sorted(zip(classes, proba), key=lambda x: -x[1])
        ]
        sent_label, sent_score = self._sentiment(text)
        urgency = self._urgency(text)
        entities = self._entities(text)
        latency_ms = int((time.perf_counter() - t0) * 1000)
        return {
            "category": category,
            "confidence": confidence,
            "categories": categories,
            "sentiment": {"label": sent_label, "score": sent_score},
            "urgency": urgency,
            "entities": entities,
            "model": self.MODEL_NAME,
            "latency_ms": max(1, latency_ms),
        }
