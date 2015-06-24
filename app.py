from flask import Flask, request, session, g, redirect, url_for, \
	abort, render_template, flash

from sqlalchemy import create_engine, case
from sqlalchemy.orm import scoped_session, sessionmaker

from database import db_session
import models
from models import Weather, BlockGroup, BikeStation, BikeRide,
	SubwayStation, SubwayDelay, Location

DEBUG = True
SECRET_KEY = 'develop'
USERNAME = 'admin'
PASSWORD = 'password'

app = Flask(__name__)
app.config.from_object(__name__)

@app.teardown_appcontext
def shutdown_session(exception=None):
    db_session.remove()

