# Moodle API Function Index

Generated from: docs/moodle/moodle_api_documentation.pdf
Generated on: 2026-03-24
Total functions: 760

## How to Use

This index is used by the `/moodle-api-agent` command. Search with grep:

- By component: `grep "core_message" docs/moodle/moodle_api_index.md`
- By keyword: `grep -i "send.*message" docs/moodle/moodle_api_index.md`
- By action: `grep -i "completion" docs/moodle/moodle_api_index.md`

## Functions

<!-- FORMAT: wsfunction | description | page | params | return_shape | ajax -->

aiplacement_courseassist_explain_text | Explain text for the Course Assistance Placement | 1 | contextid(int), prompttext(string) | {success,timecreated,prompttext,generatedcontent,finishreason,error,errormessage} | yes
aiplacement_courseassist_summarise_text | Summarise text for the Course Assistance Placement | 3 | contextid(int), prompttext(string) | {success,timecreated,prompttext,generatedcontent,finishreason,errorcode,error,errormessage} | yes
aiplacement_editor_generate_image | Generate image for the HTML Text editor AI Placement | 6 | contextid(int), prompttext(string), aspectratio(string), quality(string), numimages(int), style(string) | {success,revisedprompt,drafturl,errorcode,error,errormessage} | yes
aiplacement_editor_generate_text | Generate text for the HTML Text editor AI Placement | 9 | contextid(int), prompttext(string) | {success,timecreated,prompttext,generatedcontent,finishreason,errorcode,error,errormessage} | yes
auth_email_get_signup_settings | Get the signup required settings and profile fields. | 12 | (none) | [{namefields[],sitepolicy,sitepolicyhandler,defaultcity,country,extendedusernamechars,...}] | yes
auth_email_signup_user | Adds a new user (pendingto be confirmed) in the site. | 17 | username(string), password(string), firstname(string), lastname(string), email(string), city(string), country(string), recaptchachallengehash(string), recaptcharesponse(string), redirect(string), customprofilefields[](type,name,value) | [{success,Optional[],item,itemid,warningcode,message}] | yes
block_accessreview_get_module_data | Gets error data for course modules. | 23 | courseid(int) | [{cmid,numerrors,numchecks}] | yes
block_accessreview_get_section_data | Gets error data for course sections. | 25 | courseid(int) | [{section,numerrors,numchecks}] | yes
block_recentlyaccesseditems_get_recent_items | List of items a user has accessed most recently. | 26 | limit(int) | [{id,courseid,cmid,userid,modname,name,...}] | yes
block_starredcourses_get_starred_courses | Get users starred courses. | 29 | limit(int), offset(int) | [{id,fullname,shortname,idnumber,summary,summaryformat,...}] | yes
core_admin_set_block_protection | Set the protection state for a block plugin | 33 | plugin(string), state(int) | {} | yes
core_admin_set_plugin_order | Set the order of a plugin | 35 | plugin(string), direction(int) | {} | yes
core_admin_set_plugin_state | Set the state of a plugin | 37 | plugin(string), state(int) | {} | yes
core_ai_delete_provider_instance | Delete a provider instance | 38 | providerid(int) | {result,message,messagetype} | yes
core_ai_get_policy_status | Get a users AI policy acceptance | 40 | userid(int) | {status} | yes
core_ai_set_action | Update action | 42 | plugin(string), state(int), providerid(int) | {} | yes
core_ai_set_policy_status | Set a users AI policy acceptance | 44 | contextid(int) | {success} | yes
core_ai_set_provider_order | Set the order of a provider | 45 | plugin(int), direction(int) | {} | yes
core_ai_set_provider_status | Set a providers status | 47 | plugin(int), state(int) | {result,message,messagetype} | yes
core_auth_confirm_user | Confirm a user account. | 49 | username(string), secret(string) | [{success,Optional[],item,itemid,warningcode,message}] | yes
core_auth_is_age_digital_consent_verification_enabled | Checks if age digital consent verification is enabled. | 52 | (none) | {status} | yes
core_auth_is_minor | Requests a check if a user is a digital minor. | 53 | age(int), country(string) | {status} | yes
core_auth_request_password_reset | Requests a password reset. | 55 | username(string), email(string) | [{status,notice,Optional[],item,itemid,warningcode,message}] | yes
core_auth_resend_confirmation_email | Resend confirmation email. | 58 | username(string), password(string), redirect(string) | [{status,Optional[],item,itemid,warningcode,message}] | yes
core_backup_get_async_backup_links_backup | Gets the data to use when updating the status table row in the UI for when an async backup | 61 | filename(string), contextid(int), backupid(string) | {filesize,fileurl,restoreurl} | yes
core_backup_get_async_backup_links_restore | Gets the data to use when updating the status table row in the UI for when an async restore | 63 | backupid(string), contextid(int) | {restoreurl} | yes
core_backup_get_async_backup_progress | Get the progress of an Asyncronhous backup. | 65 | contextid(int) | [{status,progress,backupid,operation}] | yes
core_backup_get_copy_progress | Gets the progress of course copy operations. | 68 | copies[](backupid,restoreid,operation) | [{status,progress,backupid,operation}] | yes
core_backup_submit_copy_form | Handles ajax submission of course copy form. | 70 | jsonformdata(string) | {} | yes
core_badges_disable_badges | Disable badges | 71 | (none) | [{result,Optional[],item,itemid,warningcode,message}] | no
core_badges_enable_badges | Enable badges | 74 | (none) | [{result[],badgeid,awards,Optional[],item,itemid,warningcode,message}] | yes
core_badges_get_badge | Retrieves a badge by id. | 76 | id(int) | [{type,id,issuer,name,image,description,...}] | no
core_badges_get_user_badge_by_hash | Returns the badge awarded to a user by hash. | 80 | hash(string) | [{badge[],id,name,description,timecreated,timemodified,...}] | no
core_badges_get_user_badges | Returns the list of badges awarded to a user. | 88 | userid(int), courseid(int), page(int), perpage(int), search(string), onlypublic(int) | [{badges[],id,name,description,timecreated,timemodified,...}] | no
core_block_fetch_addable_blocks | Returns all addable blocks in a given page. | 98 | pagecontextid(int), pagetype(string), pagelayout(string), subpage(string), pagehash(string) | [{name,title,blockform}] | yes
core_block_get_course_blocks | Returns blocks information for a course. | 101 | courseid(int), returncontents(int) | [{instanceid,name,region,positionid,collapsible,dockable,...}] | no
core_block_get_dashboard_blocks | Returns blocks information for the given user dashboard. | 107 | userid(int), returncontents(int), mypage(string) | [{instanceid,name,region,positionid,collapsible,dockable,...}] | no
core_blog_add_entry | Creates a new blog post entry. | 113 | subject(string), summary(string), summaryformat(int), options[](name,value) | [{entryid,Optional[],item,itemid,warningcode,message}] | no
core_blog_delete_entry | Deletes a blog post entry. | 117 | entryid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
core_blog_get_access_information | Retrieves permission information for the current user. | 119 | (none) | [{canview,cansearch,canviewdrafts,cancreate,canmanageentries,canmanageexternal,...}] | no
core_blog_get_entries | Returns blog entries. | 122 | page(int), perpage(int), filters[](name,value) | [{entries[],id,module,userid,courseid,groupid,...}] | yes
core_blog_prepare_entry_for_edition | Prepare a draft area for editing a blog entry.. | 131 | entryid(int) | [{inlineattachmentsid,attachmentsid,area,name,value,Optional[],...}] | no
core_blog_update_entry | Updates a blog entry. | 134 | entryid(int), subject(string), summary(string), summaryformat(int), options[](name,value) | [{status,Optional[],item,itemid,warningcode,message}] | no
core_blog_view_entries | Trigger the blog_entries_viewed event. | 138 | filters[](name,value) | [{status,Optional[],item,itemid,warningcode,message}] | yes
core_calendar_create_calendar_events | Create calendar events | 140 | events[](name,description,format,courseid,groupid,repeats,eventtype,timestart,timeduration,visible,sequence) | [{events[],id,name,description,format,courseid,...}] | no
core_calendar_delete_calendar_events | Delete calendar events | 145 | events[](eventid,repeat) | {} | yes
core_calendar_delete_subscription | Delete the calendar subscription | 147 | subscriptionid(int) | [{status,Optional[],item,itemid,warningcode,message}] | yes
core_calendar_get_action_events_by_course | Get calendar action events by course | 149 | courseid(int), timesortfrom(int), timesortto(int), aftereventid(int), limitnum(int), searchvalue(string) | [{id,name,description,descriptionformat,location,categoryid,...}] | yes
core_calendar_get_action_events_by_courses | Get calendar action events by courses | 161 | timesortfrom(int), timesortto(int), limitnum(int), searchvalue(string) | [{id,name,description,descriptionformat,location,categoryid,...}] | yes
core_calendar_get_action_events_by_timesort | Get calendar action events by tiemsort | 173 | timesortfrom(int), timesortto(int), aftereventid(int), limitnum(int), limittononsuspendedevents(int), userid(int), searchvalue(string) | [{id,name,description,descriptionformat,location,categoryid,...}] | yes
core_calendar_get_allowed_event_types | Get the type of events a user can create in the given course. | 185 | courseid(int) | [{allowedeventtypes[],Optional[],item,itemid,warningcode,message}] | no
core_calendar_get_calendar_access_information | Convenience function to retrieve some permissions/access information for the given course | 188 | courseid(int) | [{canmanageentries,canmanageownentries,canmanagegroupentries,Optional[],item,itemid,warningcode,message}] | no
core_calendar_get_calendar_day_view | Fetch the day view data for a calendar | 190 | year(int), month(int), day(int), courseid(int), categoryid(int) | [{id,name,description,descriptionformat,location,categoryid,...}] | yes
core_calendar_get_calendar_event_by_id | Get calendar event by id | 207 | eventid(int) | [{id,name,description,descriptionformat,location,categoryid,...}] | yes
core_calendar_get_calendar_events | Get calendar events | 217 | (none) | [{events[],id,name,description,format,courseid,...}] | no
core_calendar_get_calendar_export_token | Return the auth token required for exporting a calendar. | 223 | (none) | [{token,Optional[],item,itemid,warningcode,message}] | no
core_calendar_get_calendar_monthly_view | Fetch the monthly view data for a calendar | 225 | year(int), month(int), courseid(int), categoryid(int), includenavigation(int), mini(int), day(int), view(string) | [{url,courseid,categoryid,filter_selector,seconds,minutes,...}] | yes
core_calendar_get_calendar_upcoming_view | Fetch the upcoming view data for a calendar | 247 | courseid(int), categoryid(int) | [{id,name,description,descriptionformat,location,categoryid,...}] | yes
core_calendar_get_timestamps | Fetch unix timestamps for given date times. | 260 | data[](key,year,month,day,hour,minute) | {timestamps[],key,timestamp} | yes
core_calendar_submit_create_update_form | Submit form data for event form | 262 | formdata(string) | {id,name,description,descriptionformat,location,categoryid,...} | yes
core_calendar_update_event_start_day | Update the start day (but not time) for an event. | 272 | eventid(int), daytimestamp(int) | {id,name,description,descriptionformat,location,categoryid,...} | yes
core_change_editmode | Change the editing mode | 283 | setmode(int), context(int) | {success} | no
core_check_get_result_admintree | Executes a check stored in the admin tree and returns the result | 285 | admintreeid(string), settingname(string), includedetails(int) | {status,summary,html,details} | yes
core_cohort_add_cohort_members | Adds cohort members. | 287 | (none) | [{Optional[],item,itemid,warningcode,message}] | no
core_cohort_create_cohorts | Creates new cohorts. | 290 | cohorts[](name,idnumber,description,descriptionformat,visible,theme) | [{id,name,idnumber,description,descriptionformat,visible,theme}] | no
core_cohort_delete_cohort_members | Deletes cohort members. | 294 | members[](cohortid,userid) | {} | no
core_cohort_delete_cohorts | Deletes all specified cohorts. | 295 | (none) | {} | yes
core_cohort_get_cohort_members | Returns cohort members. | 296 | (none) | [{cohortid,userids[]}] | no
core_cohort_get_cohorts | Returns cohort details. | 298 | (none) | [{id,name,idnumber,description,descriptionformat,visible,...}] | no
core_cohort_search_cohorts | Search for cohorts. | 301 | query(string), includes(string), limitfrom(int), limitnum(int) | [{cohorts[],id,name,idnumber,description,descriptionformat,...}] | yes
core_cohort_update_cohorts | Updates existing cohorts. | 306 | cohorts[](id,name,idnumber,description,descriptionformat,visible,theme) | {} | no
core_comment_add_comments | Adds a comment or comments. | 308 | comments[](contextlevel,instanceid,component,content,itemid,area) | [{id,content,format,timecreated,strftimeformat,profileurl,...}] | no
core_comment_delete_comments | Deletes a comment or comments. | 311 | (none) | [{Optional[],item,itemid,warningcode,message}] | yes
core_comment_get_comments | Returns comments. | 313 | contextlevel(string), instanceid(int), component(string), itemid(int), area(string), page(int), sortdirection(string) | [{id,content,format,timecreated,strftimeformat,profileurl,...}] | no
core_competency_add_competency_to_course | Add the competency to a course | 319 | courseid(int), competencyid(int) | {} | yes
core_competency_add_competency_to_plan | Add the competency to a learning plan | 320 | planid(int), competencyid(int) | {} | yes
core_competency_add_competency_to_template | Add the competency to a template | 322 | templateid(int), competencyid(int) | {} | yes
core_competency_add_related_competency | Adds a related competency | 324 | competencyid(int), relatedcompetencyid(int) | {} | yes
core_competency_approve_plan | Approve a plan. | 326 | id(int) | {} | yes
core_competency_competency_framework_viewed | Log event competency framework viewed | 327 | id(int) | {} | yes
core_competency_competency_viewed | Log event competency viewed | 328 | id(int) | {} | yes
core_competency_complete_plan | Complete learning plan. | 330 | planid(int) | {} | yes
core_competency_count_competencies | Count a list of a competencies. | 331 | filters[](column,value) | {} | yes
core_competency_count_competencies_in_course | List the competencies in a course | 333 | id(int) | {} | yes
core_competency_count_competencies_in_template | Count a list of a competencies for a given template. | 334 | id(int) | {} | yes
core_competency_count_competency_frameworks | Count a list of a competency frameworks. | 336 | includes(string) | {} | yes
core_competency_count_course_module_competencies | Count the competencies in a course module | 338 | cmid(int) | {} | yes
core_competency_count_courses_using_competency | List the courses using a competency | 339 | id(int) | {} | yes
core_competency_count_templates | Count a list of a learning plan templates. | 340 | includes(string) | {} | yes
core_competency_count_templates_using_competency | Count a list of a learning plan templates for a given competency. | 342 | id(int) | {} | yes
core_competency_create_competency | Creates new competencies. | 344 | (none) | {shortname,idnumber,description,descriptionformat,sortorder,parentid,...} | no
core_competency_create_competency_framework | Creates new competency frameworks. | 348 | (none) | {shortname,idnumber,description,descriptionformat,visible,scaleid,...} | yes
core_competency_create_plan | Creates a learning plan. | 352 | (none) | {name,description,descriptionformat,userid,templateid,origtemplateid,...} | yes
core_competency_create_template | Creates new learning plan templates. | 362 | (none) | {shortname,description,descriptionformat,duedate,visible,contextid,...} | yes
core_competency_create_user_evidence_competency | Create an evidence of prior learning relationship with a competency. | 365 | userevidenceid(int), competencyid(int) | {userevidenceid,competencyid,id,timecreated,timemodified,usermodified} | yes
core_competency_delete_competency | Delete a competency. | 367 | id(int) | {} | yes
core_competency_delete_competency_framework | Delete a competency framework. | 369 | id(int) | {} | yes
core_competency_delete_evidence | Delete an evidence | 370 | id(int) | {} | yes
core_competency_delete_plan | Delete a learning plan. | 372 | id(int) | {} | yes
core_competency_delete_template | Delete a learning plan template. | 373 | id(int), deleteplans(int) | {} | yes
core_competency_delete_user_evidence | Delete an evidence of prior learning. | 375 | id(int) | {} | yes
core_competency_delete_user_evidence_competency | Delete an evidence of prior learning relationship with a competency. | 376 | userevidenceid(int), competencyid(int) | {} | yes
core_competency_duplicate_competency_framework | Duplicate a competency framework. | 378 | id(int) | {shortname,idnumber,description,descriptionformat,visible,scaleid,...} | yes
core_competency_duplicate_template | Duplicate learning plan template. | 381 | id(int) | {shortname,description,descriptionformat,duedate,visible,contextid,...} | yes
core_competency_get_scale_values | Fetch the values for a specific scale | 384 | scaleid(int) | [{id,name}] | no
core_competency_grade_competency | Grade a competency. | 386 | userid(int), competencyid(int), grade(int), note(string) | {usercompetencyid,contextid,action,actionuserid,descidentifier,desccomponent,...} | yes
core_competency_grade_competency_in_course | Grade a competency from the course page. | 391 | courseid(int), userid(int), competencyid(int), grade(int), note(string) | {usercompetencyid,contextid,action,actionuserid,descidentifier,desccomponent,...} | yes
core_competency_grade_competency_in_plan | Grade a competency from the user plan page. | 396 | planid(int), competencyid(int), grade(int), note(string) | {usercompetencyid,contextid,action,actionuserid,descidentifier,desccomponent,...} | yes
core_competency_list_competencies | Load a list of a competencies. | 402 | sort(string), order(string), skip(int), limit(int), filters[](column,value) | [{shortname,idnumber,description,descriptionformat,sortorder,parentid,...}] | yes
core_competency_list_competencies_in_template | Load a list of a competencies for a given template. | 406 | id(int) | [{shortname,idnumber,description,descriptionformat,sortorder,parentid,...}] | yes
core_competency_list_competency_frameworks | Load a list of a competency frameworks. | 410 | sort(string), order(string), skip(int), limit(int), includes(string), onlyvisible(int), query(string) | [{shortname,idnumber,description,descriptionformat,visible,scaleid,...}] | yes
core_competency_list_course_competencies | List the competencies in a course | 415 | id(int) | [{shortname,idnumber,description,descriptionformat,sortorder,parentid,...}] | yes
core_competency_list_course_module_competencies | List the competencies in a course module | 420 | cmid(int) | [{shortname,idnumber,description,descriptionformat,sortorder,parentid,...}] | yes
core_competency_list_plan_competencies | List the competencies in a plan | 424 | id(int) | [{shortname,idnumber,description,descriptionformat,sortorder,parentid,...}] | yes
core_competency_list_templates | Load a list of a learning plan templates. | 432 | sort(string), order(string), skip(int), limit(int), includes(string), onlyvisible(int) | [{shortname,description,descriptionformat,duedate,visible,contextid,...}] | no
core_competency_list_templates_using_competency | Load a list of a learning plan templates for a given competency. | 438 | id(int) | [{shortname,description,descriptionformat,duedate,visible,contextid,...}] | yes
core_competency_list_user_plans | List a user's learning plans. | 441 | userid(int) | [{name,description,descriptionformat,userid,templateid,origtemplateid,...}] | yes
core_competency_move_down_competency | Re-order a competency. | 450 | id(int) | {} | yes
core_competency_move_up_competency | Re-order a competency. | 451 | id(int) | {} | yes
core_competency_plan_cancel_review_request | Cancel the review of a plan. | 453 | id(int) | {} | yes
core_competency_plan_request_review | Request for a plan to be reviewed. | 454 | id(int) | {} | yes
core_competency_plan_start_review | Start the review of a plan. | 456 | id(int) | {} | yes
core_competency_plan_stop_review | Stop the review of a plan. | 457 | id(int) | {} | yes
core_competency_read_competency | Load a summary of a competency. | 458 | id(int) | {shortname,idnumber,description,descriptionformat,sortorder,parentid,...} | yes
core_competency_read_competency_framework | Load a summary of a competency framework. | 461 | id(int) | {shortname,idnumber,description,descriptionformat,visible,scaleid,...} | yes
core_competency_read_plan | Load a learning plan. | 464 | id(int) | {name,description,descriptionformat,userid,templateid,origtemplateid,...} | yes
core_competency_read_template | Load a summary of a learning plan template. | 473 | id(int) | {shortname,description,descriptionformat,duedate,visible,contextid,...} | yes
core_competency_read_user_evidence | Read an evidence of prior learning. | 476 | id(int) | [{userid,name,description,descriptionformat,url,id,...}] | yes
core_competency_remove_competency_from_course | Remove a competency from a course | 483 | courseid(int), competencyid(int) | {} | yes
core_competency_remove_competency_from_plan | Remove the competency from a learning plan | 485 | planid(int), competencyid(int) | {} | yes
core_competency_remove_competency_from_template | Remove a competency from a template | 486 | templateid(int), competencyid(int) | {} | yes
core_competency_remove_related_competency | Remove a related competency | 488 | competencyid(int), relatedcompetencyid(int) | {} | yes
core_competency_reopen_plan | Reopen learning plan. | 490 | planid(int) | {} | yes
core_competency_reorder_course_competency | Move a course competency to a new relative sort order. | 491 | courseid(int), competencyidfrom(int), competencyidto(int) | {} | yes
core_competency_reorder_plan_competency | Move a plan competency to a new relative sort order. | 493 | planid(int), competencyidfrom(int), competencyidto(int) | {} | yes
core_competency_reorder_template_competency | Move a template competency to a new relative sort order. | 495 | templateid(int), competencyidfrom(int), competencyidto(int) | {} | yes
core_competency_request_review_of_user_evidence_linked_competencies | Send user evidence competencies in review | 497 | id(int) | {} | yes
core_competency_search_competencies | Search a list of a competencies. | 499 | searchtext(string), competencyframeworkid(int) | [{shortname,idnumber,description,descriptionformat,sortorder,parentid,...}] | yes
core_competency_set_course_competency_ruleoutcome | Modify the ruleoutcome value for course competency | 502 | coursecompetencyid(int), ruleoutcome(int) | {} | yes
core_competency_set_parent_competency | Set a new parent for a competency. | 504 | competencyid(int), parentid(int) | {} | yes
core_competency_template_has_related_data | Check if a template has related data | 506 | id(int) | {} | yes
core_competency_template_viewed | Log event template viewed | 507 | id(int) | {} | yes
core_competency_unapprove_plan | Unapprove a plan. | 509 | id(int) | {} | yes
core_competency_unlink_plan_from_template | Unlink a plan form it template. | 510 | planid(int) | {} | yes
core_competency_update_competency | Update a competency. | 511 | (none) | {} | yes
core_competency_update_competency_framework | Update a competency framework. | 514 | (none) | {} | yes
core_competency_update_course_competency_settings | Update the course competency settings | 516 | courseid(int) | {} | yes
core_competency_update_plan | Updates a learning plan. | 518 | (none) | {name,description,descriptionformat,userid,templateid,origtemplateid,...} | yes
core_competency_update_template | Update a learning plan template. | 528 | (none) | {} | yes
core_competency_user_competency_cancel_review_request | Cancel a review request. | 530 | userid(int), competencyid(int) | {} | yes
core_competency_user_competency_plan_viewed | Log the user competency plan viewed event. | 532 | competencyid(int), userid(int), planid(int) | {} | yes
core_competency_user_competency_request_review | Request a review. | 534 | userid(int), competencyid(int) | {} | no
core_competency_user_competency_start_review | Start a review. | 536 | userid(int), competencyid(int) | {} | yes
core_competency_user_competency_stop_review | Stop a review. | 537 | userid(int), competencyid(int) | {} | yes
core_competency_user_competency_viewed | Log the user competency viewed event. | 539 | usercompetencyid(int) | {} | yes
core_competency_user_competency_viewed_in_course | Log the user competency viewed in course event | 540 | competencyid(int), userid(int), courseid(int) | {} | yes
core_competency_user_competency_viewed_in_plan | Log the user competency viewed in plan event. | 542 | competencyid(int), userid(int), planid(int) | {} | yes
core_completion_get_activities_completion_status | Return the activities completion status for a user in a course. | 545 | courseid(int), userid(int) | [{cmid,modname,instance,state,timecompleted,tracking,...}] | no
core_completion_get_course_completion_status | Returns course completion status. | 549 | courseid(int), userid(int) | [{completed,aggregation,completions[],type,title,status,...}] | no
core_completion_mark_course_self_completed | Update the course completion status for the current user (if course self-completion is | 554 | courseid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
core_completion_override_activity_completion_status | Update completion status for a user in an activity by overriding it. | 556 | userid(int), cmid(int), newstate(int) | {cmid,userid,state,timecompleted,overrideby,tracking} | yes
core_completion_update_activity_completion_status_manually | Update completion status for the current user in an activity, only for activities with manual | 559 | cmid(int), completed(int) | [{status,Optional[],item,itemid,warningcode,message}] | yes
core_contentbank_copy_content | Copy a content in the content bank. | 561 | contentid(int), name(string) | [{id,Optional[],item,itemid,warningcode,message}] | yes
core_contentbank_delete_content | Delete a content from the content bank. | 564 | (none) | [{result,Optional[],item,itemid,warningcode,message}] | yes
core_contentbank_rename_content | Rename a content in the content bank. | 566 | contentid(int), name(string) | [{result,Optional[],item,itemid,warningcode,message}] | yes
core_contentbank_set_content_visibility | Set the visibility of a content in the content bank. | 569 | contentid(int), visibility(int) | [{result,Optional[],item,itemid,warningcode,message}] | yes
core_course_add_content_item_to_user_favourites | Adds a content item (activity, resource or their subtypes) to the favourites for the user.? | 571 | componentname(string), contentitemid(int) | {id,name,title,link,icon,help,...} | yes
core_course_check_updates | Check if there is updates affecting the user for the given course and contexts. | 575 | courseid(int), tocheck[](contextlevel,id,since) | [{instances[],contextlevel,id,updates[],name,timeupdated,...}] | yes
core_course_create_categories | Create course categories | 579 | categories[](name,parent,idnumber,description,descriptionformat,theme) | [{id,name}] | no
core_course_create_courses | Create new courses | 581 | courses[](fullname,shortname,categoryid,idnumber,summary,summaryformat,format,showgrades,newsitems,startdate,enddate,numsections,maxbytes,showreports,visible,hiddensections,groupmode,groupmodeforce,defaultgroupingid,enablecompletion,completionnotify,lang,forcetheme) | [{id,shortname}] | no
core_course_delete_categories | Delete course categories | 585 | categories[](id,newparent,recursive) | {} | no
core_course_delete_courses | Deletes all specified courses | 586 | (none) | [{Optional[],item,itemid,warningcode,message}] | no
core_course_delete_modules | Deletes all specified module instances | 589 | (none) | {} | no
core_course_duplicate_course | Duplicate an existing course (creating a new one). | 590 | courseid(int), fullname(string), shortname(string), categoryid(int), visible(int), options[](name,value) | {id,shortname} | no
core_course_edit_module | Deprecated | 594 | action(string), id(int), sectionreturn(int) | {} | yes
core_course_edit_section | Deprecated | 596 | action(string), id(int), sectionreturn(int) | {} | yes
core_courseformat_create_module | Deprecated | 598 | courseid(int), modname(string), targetsectionnum(int), targetcmid(int) | {} | yes
core_courseformat_file_handlers | Get the current course file hanlders. | 601 | courseid(int) | [{extension,module,message}] | yes
core_courseformat_get_overview_information | Get the course overview information for an specific activity type. | 602 | courseid(int), modname(string) | [{courseid,hasintegration,name,key,align,name,...}] | yes
core_courseformat_get_section_content_items | Fetch all the content items (activities, resources and their subtypes) for the activity picker | 607 | courseid(int), sectionid(int) | {content_items[],id,name,title,link,icon,...} | yes
core_courseformat_get_state | Get the current course state. | 610 | courseid(int) | {} | yes
core_courseformat_log_view_overview_information | Logs the course overview information page has been visited on an external application. | 612 | courseid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
core_courseformat_new_module | Create a new module to course. | 614 | courseid(int), modname(string), targetsectionid(int), targetcmid(int) | {} | yes
core_courseformat_update_course | Update course contents. | 616 | action(string), courseid(int), targetsectionid(int), targetcmid(int) | {} | yes
core_course_get_activity_chooser_footer | Fetch the data for the activity chooser footer. | 620 | courseid(int), sectionid(int) | {footer,customfooterjs,customfootertemplate,customcarouseltemplate} | yes
core_course_get_categories | Return category details | 622 | addsubcategories(int), criteria[](key,value) | [{id,name,idnumber,description,descriptionformat,parent,...}] | no
core_course_get_contents | Get course contents | 625 | courseid(int), options[](name,value) | [{id,name,visible,summary,summaryformat,section,...}] | no
core_course_get_course_content_items | Deprecated | 638 | courseid(int), sectionnum(int) | {content_items[],id,name,title,link,icon,...} | yes
core_course_get_course_module | Return information about a course module | 642 | cmid(int) | [{id,course,module,name,modname,instance,...}] | no
core_course_get_course_module_by_instance | Return information about a given module name and instance id | 648 | module(string), instance(int) | [{id,course,module,name,modname,instance,...}] | no
core_course_get_courses | Return course details | 654 | (none) | [{id,shortname,categoryid,categorysortorder,fullname,displayname,...}] | yes
core_course_get_courses_by_field | Get courses matching a specific field (id/s, shortname, idnumber, category) | 660 | field(string), value(string) | [{id,fullname,displayname,shortname,courseimage,categoryid,...}] | no
core_course_get_enrolled_courses_by_timeline_classification | List of enrolled courses for the given timeline classification (past, inprogress, or future). | 671 | classification(string), limit(int), offset(int), sort(string), customfieldname(string), customfieldvalue(string), searchvalue(string) | [{id,fullname,shortname,idnumber,summary,summaryformat,...}] | yes
core_course_get_enrolled_courses_with_action_events_by_timeline_classification | List of enrolled courses with action events in a given timeframe, for the given timeline | 677 | classification(string), limit(int), offset(int), sort(string), customfieldname(string), customfieldvalue(string), searchvalue(string), eventsfrom(int), eventsto(int) | [{id,fullname,shortname,idnumber,summary,summaryformat,...}] | yes
core_course_get_enrolled_users_by_cmid | List users by course module id, filter by group and active enrolment status. | 684 | cmid(int), groupid(int), onlyactive(int) | [{users[],id,profileimage,fullname,firstname,lastname,...}] | yes
core_course_get_module | Deprecated | 687 | id(int), sectionreturn(int) | {} | yes
core_course_get_recent_courses | List of courses a user has accessed most recently. | 689 | userid(int), limit(int), offset(int), sort(string) | [{id,fullname,shortname,idnumber,summary,summaryformat,...}] | yes
core_course_get_updates_since | Check if there are updates affecting the user for the given course since the given time | 694 | courseid(int), since(int) | [{instances[],contextlevel,id,updates[],name,timeupdated,...}] | yes
core_course_get_user_administration_options | Return a list of administration options in a set of courses that are avaialable or not for the | 698 | (none) | [{id,options[],name,available,Optional[],item,...}] | no
core_course_get_user_navigation_options | Return a list of navigation options in a set of courses that are avaialable or not for the | 701 | (none) | [{id,options[],name,available,Optional[],item,...}] | no
core_course_import_course | Import course data from a course into another course. Does not include any user data.? | 704 | importfrom(int), importto(int), deletecontent(int), options[](name,value) | {} | no
core_course_remove_content_item_from_user_favourites | Removes a content item (activity, resource or their subtypes) from the favourites for the | 707 | componentname(string), contentitemid(int) | {id,name,title,link,icon,help,...} | yes
core_course_search_courses | Search courses by (name, module, block, tag) | 710 | criterianame(string), criteriavalue(string), page(int), perpage(int), limittoenrolled(int), onlywithcompletion(int) | [{total,id,fullname,displayname,shortname,courseimage,...}] | yes
core_course_set_favourite_courses | Add a list of courses to the list of favourite courses. | 720 | courses[](id,favourite) | [{Optional[],item,itemid,warningcode,message}] | yes
core_course_toggle_activity_recommendation | Adds or removes an activity as a recommendation in the activity chooser. | 722 | area(string), id(int) | {id,area,status} | yes
core_course_update_categories | Update categories | 724 | categories[](id,name,idnumber,parent,description,descriptionformat,theme) | {} | no
core_course_update_courses | Update courses | 726 | courses[](id,fullname,shortname,categoryid,idnumber,summary,summaryformat,format,showgrades,newsitems,startdate,enddate,numsections,maxbytes,showreports,visible,hiddensections,groupmode,groupmodeforce,defaultgroupingid,enablecompletion,completionnotify,lang,forcetheme) | [{Optional[],item,itemid,warningcode,message}] | no
core_course_view_course | Log that the course was viewed | 730 | courseid(int), sectionnumber(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
core_course_view_module_instance_list | Logs that a module instance list has been viewed on an external application. | 732 | courseid(int), modname(string) | [{status,Optional[],item,itemid,warningcode,message}] | no
core_create_userfeedback_action_record | Record the action that the user takes in the user feedback notification for future use. | 736 | action(string), contextid(int) | {} | yes
core_customfield_create_category | Creates a new category | 737 | component(string), area(string), itemid(int) | {} | yes
core_customfield_delete_category | Deletes a category | 739 | id(int) | {} | yes
core_customfield_delete_field | Deletes an entry | 740 | id(int) | {} | yes
core_customfield_move_category | Drag and drop categories | 741 | id(int), beforeid(int) | {} | yes
core_customfield_move_field | Drag and drop | 742 | id(int), categoryid(int), beforeid(int) | {} | yes
core_customfield_reload_template | Reloads template | 744 | component(string), area(string), itemid(int) | {component,area,itemid,usescategories,categories[],id,...} | yes
core_customfield_toggle_shared | Toggle shared category state | 748 | categoryid(int), component(string), area(string), itemid(int), state(int) | {} | yes
core_dynamic_tabs_get_content | Returns the content for a dynamic tab | 751 | tab(string), jsondata(string) | {template,content,javascript} | yes
core_enrol_get_course_enrolment_methods | Get the list of course enrolment methods | 753 | courseid(int) | [{id,courseid,type,name,status,wsfunction}] | no
core_enrol_get_enrolled_users | Get enrolled users by course id. | 755 | courseid(int), options[](name,value) | [{id,username,firstname,lastname,fullname,email,...}] | no
core_enrol_get_enrolled_users_with_capability | For each course and capability specified, return a list of the users that are enrolled in the | 763 | coursecapabilities[](courseid), options[](name,value) | [{courseid,capability,id,username,firstname,lastname,...}] | no
core_enrol_get_potential_users | Get the list of potential users to enrol | 772 | courseid(int), enrolid(int), search(string), searchanywhere(int), page(int), perpage(int) | [{id,username,firstname,lastname,fullname,email,...}] | yes
core_enrol_get_users_courses | Get the list of courses where a user is enrolled in | 779 | userid(int), returnusercount(int) | [{id,shortname,fullname,displayname,enrolledusercount,idnumber,...}] | no
core_enrol_search_users | Search within the list of course participants | 784 | courseid(int), search(string), searchanywhere(int), page(int), perpage(int), contextid(int) | [{id,username,firstname,lastname,fullname,email,...}] | yes
core_enrol_submit_user_enrolment_form | Submit form data for enrolment form | 791 | formdata(string) | {result,validationerror} | yes
core_enrol_unenrol_user_enrolment | External function that unenrols a given user enrolment | 793 | ueid(int) | [{result,key,message}] | yes
core_fetch_notifications | Return a list of notifications for the current session | 795 | contextid(int) | [{template,message,extraclasses,announce,closebutton}] | yes
core_files_delete_draft_files | Delete the indicated files (or directories) from a user draft file area. | 797 | draftitemid(int), files[](filepath,filename) | [{parentpaths[],Optional[],item,itemid,warningcode,message}] | no
core_files_get_files | browse moodle files | 800 | contextid(int), component(string), filearea(string), itemid(int), filepath(string), filename(string), modified(int), contextlevel(string), instanceid(int) | {parents[],contextid,contextid,filesize,author,license} | no
core_files_get_unused_draft_itemid | Generate a new draft itemid for the current user. | 806 | (none) | [{component,contextid,userid,filearea,itemid,Optional[],...}] | no
core_files_upload | upload a file to moodle | 809 | contextid(int), component(string), filearea(string), itemid(int), filepath(string), filename(string), filecontent(string), contextlevel(string), instanceid(int) | {contextid} | no
core_filters_get_all_states | Retrieve all the filters and their states (including overridden ones in any context). | 813 | (none) | [{contextlevel,instanceid,contextid,filter,state,sortorder,...}] | no
core_filters_get_available_in_context | Returns the filters available in the given contexts. | 816 | contexts[](contextlevel,instanceid) | [{contextlevel,instanceid,contextid,filter,localstate,inheritedstate,...}] | no
core_form_dynamic_form | Process submission of a dynamic (modal) form | 819 | form(string), formdata(string) | {submitted,data,html,javascript} | yes
core_form_get_filetypes_browser_data | Provides data for the filetypes element browser. | 821 | onlytypes(string), allowall(int), current(string) | [{key,name,selectable,selected,ext,expanded,...}] | yes
core_get_component_strings | Return all raw strings (with $a→xxx, for a specific component - similar to core | 825 | component(string), lang(string) | [{stringid,string}] | yes
core_get_fragment | Return a fragment for inclusion, such as a JavaScript page. | 827 | component(string), callback(string), contextid(int), args[](name,value) | {html,javascript} | yes
core_get_string | Return a translated string - similar to core get_string(), call | 830 | stringid(string), component(string), lang(string), stringparams[](name,value) | {} | yes
core_get_strings | Return some translated strings - like several core get_string(), calls | 833 | strings[](stringid,component,lang) | [{stringid,component,lang,string}] | yes
core_get_user_dates | Return formatted timestamps | 835 | contextid(int), contextlevel(string), instanceid(int), timestamps[](timestamp,format,type,fixday,fixhour) | {dates[]} | yes
core_grades_create_gradecategories | Create grade categories inside a course gradebook. | 838 | courseid(int), categories[](fullname) | [{categoryids[],Optional[],item,itemid,warningcode,message}] | no
core_grades_get_enrolled_users_for_selector | Returns the enrolled users within and map some fields to the returned array of user objects. | 842 | courseid(int), groupid(int) | [{users[],id,username,firstname,lastname,fullname,...}] | yes
core_grades_get_feedback | Get the feedback data for a grade item | 849 | courseid(int), userid(int), itemid(int) | {feedbacktext,title,fullname,picture,additionalfield} | yes
core_grades_get_gradable_users | Returns the gradable users in a course | 852 | courseid(int), groupid(int), onlyactive(int) | [{users[],id,username,firstname,lastname,fullname,...}] | yes
core_grades_get_gradeitems | Get the gradeitems for a course | 859 | courseid(int) | [{gradeItems[],id,itemname,category,Optional[],item,...}] | yes
core_grades_get_grade_tree | Get the grade tree structure for a course | 861 | courseid(int) | {} | yes
core_grades_get_groups_for_selector | ** DEPRECATED ** Please do not call this function any more. Use | 863 | courseid(int), cmid(int) | [{groups[],id,name,groupimageurl,participation,Optional[],...}] | yes
core_grades_grader_gradingpanel_point_fetch | Fetch the data required to display the grader grading panel for simple grading, creating the | 866 | component(string), contextid(int), itemname(string), gradeduserid(int) | [{templatename,hasgrade,grade,usergrade,maxgrade,gradedby,...}] | yes
core_grades_grader_gradingpanel_point_store | Store the data required to display the grader grading panel for simple grading | 870 | component(string), contextid(int), itemname(string), gradeduserid(int), notifyuser(int), formdata(string) | [{templatename,hasgrade,grade,usergrade,maxgrade,gradedby,...}] | yes
core_grades_grader_gradingpanel_scale_fetch | Fetch the data required to display the grader grading panel for scale-based grading, | 875 | component(string), contextid(int), itemname(string), gradeduserid(int) | [{templatename,hasgrade,value,title,selected,maxgrade,...}] | yes
core_grades_grader_gradingpanel_scale_store | Store the data required to display the grader grading panel for scale-based grading | 879 | component(string), contextid(int), itemname(string), gradeduserid(int), notifyuser(int), formdata(string) | [{templatename,hasgrade,value,title,selected,maxgrade,...}] | yes
core_grades_update_grades | Update a grade item and associated student grades. | 885 | source(string), courseid(int), component(string), activityid(int), itemnumber(int), grades[](studentid,grade,str_feedback) | {} | no
core_grading_get_definitions | Get grading definitions | 889 | areaname(string), activeonly(int) | [{cmid,contextid,component,areaname,activemethod,id,...}] | no
core_grading_get_gradingform_instances | Get grading form instances | 898 | definitionid(int), since(int) | [{id,raterid,itemid,rawgrade,status,feedback,...}] | no
core_grading_save_definitions | Save grading definitions | 903 | areas[](cmid,contextid,component,areaname,activemethod) | {} | no
core_group_add_group_members | Adds group members. | 907 | members[](groupid,userid) | {} | no
core_group_assign_grouping | Assing groups from groupings | 909 | assignments[](groupingid,groupid) | {} | no
core_group_create_groupings | Creates new groupings | 910 | groupings[](courseid,name,description,descriptionformat,idnumber) | [{id,courseid,name,description,descriptionformat,idnumber,shortname,value}] | no
core_group_create_groups | Creates new groups. | 913 | groups[](courseid,name,description,descriptionformat,enrolmentkey,idnumber,visibility,participation) | [{id,courseid,name,description,descriptionformat,enrolmentkey,...}] | no
core_group_delete_groupings | Deletes all specified groupings. | 917 | (none) | {} | no
core_group_delete_group_members | Deletes group members. | 918 | members[](groupid,userid) | {} | no
core_group_delete_groups | Deletes all specified groups. | 920 | (none) | {} | no
core_group_get_activity_allowed_groups | Gets a list of groups that the user is allowed to access within the specified activity. | 921 | cmid(int), userid(int) | [{groups[],id,name,description,descriptionformat,idnumber,...}] | no
core_group_get_activity_groupmode | Returns effective groupmode used in a given activity. | 924 | cmid(int) | [{groupmode,Optional[],item,itemid,warningcode,message}] | no
core_group_get_course_groupings | Returns all groupings in specified course. | 926 | courseid(int) | [{id,courseid,name,description,descriptionformat,idnumber}] | no
core_group_get_course_groups | Returns all groups in specified course. | 928 | courseid(int) | [{id,courseid,name,description,descriptionformat,enrolmentkey,...}] | yes
core_group_get_course_user_groups | Returns all groups in specified course for the specified user. | 931 | courseid(int), userid(int), groupingid(int) | [{groups[],id,name,description,descriptionformat,idnumber,...}] | no
core_group_get_groupings | Returns groupings details. | 935 | returngroups(int) | [{id,courseid,name,description,descriptionformat,idnumber,...}] | no
core_group_get_group_members | Returns group members. | 940 | (none) | [{groupid,userids[]}] | no
core_group_get_groups | Returns group details. | 942 | (none) | [{id,courseid,name,description,descriptionformat,enrolmentkey,...}] | no
core_group_get_groups_for_selector | Get the group/(s) for a course | 946 | courseid(int), cmid(int) | [{groups[],id,name,groupimageurl,participation,Optional[],...}] | yes
core_group_unassign_grouping | Unassing groups from groupings | 949 | unassignments[](groupingid,groupid) | {} | no
core_group_update_groupings | Updates existing groupings | 950 | groupings[](id,name,description,descriptionformat,idnumber) | {} | no
core_group_update_groups | Updates existing groups. | 952 | groups[](id,name,description,descriptionformat,enrolmentkey,idnumber,visibility,participation) | {} | no
core_h5p_get_trusted_h5p_file | Get the H5P file cleaned for Mobile App. | 954 | url(string), frame(int), export(int), embed(int), copyright(int) | [{filename,filepath,filesize,fileurl,timemodified,mimetype,...}] | yes
core_message_block_user | Blocks a user | 958 | userid(int), blockeduserid(int) | [{Optional[],item,itemid,warningcode,message}] | yes
core_message_confirm_contact_request | Confirms a contact request | 961 | userid(int), requesteduserid(int) | [{Optional[],item,itemid,warningcode,message}] | yes
core_message_create_contact_request | Creates a contact request | 963 | userid(int), requesteduserid(int) | [{id,userid,requesteduserid,timecreated,Optional[],item,...}] | yes
core_message_data_for_messagearea_search_messages | Retrieve the template data for searching for messages | 966 | userid(int), search(string), limitfrom(int), limitnum(int) | {contacts[],userid,fullname,profileimageurl,profileimageurlsmall,ismessaging,...} | yes
core_message_decline_contact_request | Declines a contact request | 970 | userid(int), requesteduserid(int) | [{Optional[],item,itemid,warningcode,message}] | yes
core_message_delete_contacts | Remove contacts from the contact list | 973 | userid(int) | {} | yes
core_message_delete_conversations_by_id | Deletes a list of conversations. | 974 | userid(int) | [{Optional[],item,itemid,warningcode,message}] | yes
core_message_delete_message | Deletes a message. | 977 | messageid(int), userid(int), read(int) | [{status,Optional[],item,itemid,warningcode,message}] | yes
core_message_delete_message_for_all_users | Deletes a message for all users. | 980 | messageid(int), userid(int) | [{Optional[],item,itemid,warningcode,message}] | yes
core_message_get_blocked_users | Retrieve a list of users blocked | 982 | userid(int) | [{id,fullname,profileimageurl,Optional[],item,itemid,warningcode,message}] | no
core_message_get_contact_requests | Returns contact requests for a user | 985 | userid(int), limitfrom(int), limitnum(int) | [{id,fullname,profileurl,profileimageurl,profileimageurlsmall,isonline,...}] | yes
core_message_get_conversation | Retrieve a conversation for a user | 990 | userid(int), conversationid(int), includecontactrequests(int), includeprivacyinfo(int), memberlimit(int), memberoffset(int), messagelimit(int), messageoffset(int), newestmessagesfirst(int) | [{id,name,subname,imageurl,type,membercount,...}] | no
core_message_get_conversation_between_users | Retrieve a conversation for a user between another user | 999 | userid(int), otheruserid(int), includecontactrequests(int), includeprivacyinfo(int), memberlimit(int), memberoffset(int), messagelimit(int), messageoffset(int), newestmessagesfirst(int) | [{id,name,subname,imageurl,type,membercount,...}] | yes
core_message_get_conversation_counts | Retrieve a list of conversation counts, indexed by type. | 1007 | userid(int) | {favourites,1,2,3} | yes
core_message_get_conversation_members | Retrieve a list of members in a conversation | 1009 | userid(int), conversationid(int), includecontactrequests(int), includeprivacyinfo(int), limitfrom(int), limitnum(int) | [{id,fullname,profileurl,profileimageurl,profileimageurlsmall,isonline,...}] | yes
core_message_get_conversation_messages | Retrieve the conversation messages and relevant member information | 1015 | currentuserid(int), convid(int), limitfrom(int), limitnum(int), newest(int), timefrom(int) | [{id,members[],id,fullname,profileurl,profileimageurl,...}] | yes
core_message_get_conversations | Retrieve a list of conversations for a user | 1022 | userid(int), limitfrom(int), limitnum(int), type(int), favourites(int), mergeself(int) | [{conversations[],id,name,subname,imageurl,type,...}] | yes
core_message_get_member_info | Retrieve a user message profiles | 1030 | referenceuserid(int), includecontactrequests(int), includeprivacyinfo(int) | [{id,fullname,profileurl,profileimageurl,profileimageurlsmall,isonline,...}] | yes
core_message_get_message_processor | Get a message processor | 1035 | userid(int), name(string) | {systemconfigured,userconfigured} | yes
core_message_get_messages | Retrieve a list of messages sent and received by a user (conversations, notifications or | 1037 | useridto(int), useridfrom(int), type(string), read(int), newestfirst(int), limitfrom(int), limitnum(int) | [{messages[],id,useridfrom,useridto,subject,text,...}] | yes
core_message_get_received_contact_requests_count | Gets the number of received contact requests | 1043 | userid(int) | {} | yes
core_message_get_self_conversation | Retrieve a self-conversation for a user | 1045 | userid(int), messagelimit(int), messageoffset(int), newestmessagesfirst(int) | [{id,name,subname,imageurl,type,membercount,...}] | yes
core_message_get_unread_conversation_counts | Retrieve a list of unread conversation counts, indexed by type. | 1052 | userid(int) | {favourites,1,2,3} | yes
core_message_get_unread_conversations_count | Retrieve the count of unread conversations for a given user | 1054 | useridto(int) | {} | yes
core_message_get_unread_notification_count | Get number of unread notifications. | 1055 | useridto(int) | {} | no
core_message_get_unsent_message | Get an unsent message string | 1057 | (none) | {message,conversationid,otheruserid} | yes
core_message_get_user_contacts | Retrieve the contact list | 1058 | userid(int), limitfrom(int), limitnum(int) | [{id,fullname,profileurl,profileimageurl,profileimageurlsmall,isonline,...}] | yes
core_message_get_user_message_preferences | Get the message preferences for a given user. | 1063 | userid(int) | [{userid,disableall,displayname,name,hassettings,contextid,...}] | yes
core_message_get_user_notification_preferences | Get the notification preferences for a given user. | 1068 | userid(int) | [{userid,disableall,displayname,name,hassettings,contextid,...}] | no
core_message_mark_all_conversation_messages_as_read | Mark all conversation messages as read for a given user | 1073 | userid(int), conversationid(int) | {} | yes
core_message_mark_all_notifications_as_read | Mark all notifications as read for a given user | 1074 | useridto(int), useridfrom(int), timecreatedto(int) | {} | yes
core_message_mark_message_read | Mark a single message as read, trigger message_viewed event. | 1077 | messageid(int), timeread(int) | [{messageid,Optional[],item,itemid,warningcode,message}] | yes
core_message_mark_notification_read | Mark a single notification as read, trigger notification_viewed event. | 1079 | notificationid(int), timeread(int) | [{notificationid,Optional[],item,itemid,warningcode,message}] | yes
core_message_message_processor_config_form | Process the message processor config form | 1082 | userid(int), name(string), formvalues[](name,value) | {} | yes
core_message_message_search_users | Retrieve the data for searching for people | 1084 | userid(int), search(string), limitfrom(int), limitnum(int) | [{contacts[],id,fullname,profileurl,profileimageurl,profileimageurlsmall,...}] | yes
core_message_mute_conversations | Mutes a list of conversations | 1092 | userid(int) | [{Optional[],item,itemid,warningcode,message}] | yes
core_message_search_contacts | Search for contacts | 1095 | searchtext(string), onlymycourses(int) | [{id,fullname,profileimageurl,profileimageurlsmall}] | no
core_message_send_instant_messages | Send instant messages | 1097 | messages[](touserid,text,textformat,clientmsgid) | [{msgid,clientmsgid,errormessage,text,timecreated,conversationid,useridfrom,candeletemessagesforallusers}] | yes
core_message_send_messages_to_conversation | Send messages to an existing conversation between users | 1100 | conversationid(int), messages[](text,textformat) | [{id,useridfrom,text,timecreated}] | yes
core_message_set_default_notification | Set the default value for a given notification preference | 1102 | preference(string), state(int) | {successmessage} | yes
core_message_set_favourite_conversations | Mark a conversation or group of conversations as favourites/starred conversations. | 1104 | userid(int) | [{Optional[],item,itemid,warningcode,message}] | yes
core_message_set_unsent_message | Store an unsent message string | 1106 | message(string), conversationid(int), otheruserid(int) | {} | yes
core_message_unblock_user | Unblocks a user | 1108 | userid(int), unblockeduserid(int) | [{Optional[],item,itemid,warningcode,message}] | yes
core_message_unmute_conversations | Unmutes a list of conversations | 1111 | userid(int) | [{Optional[],item,itemid,warningcode,message}] | yes
core_message_unset_favourite_conversations | Unset a conversation or group of conversations as favourites/starred conversations. | 1113 | userid(int) | [{Optional[],item,itemid,warningcode,message}] | yes
core_moodlenet_auth_check | Check a user has authorized for a given MoodleNet site | 1116 | issuerid(int), courseid(int) | [{loginurl,status,Optional[],item,itemid,warningcode,message}] | yes
core_moodlenet_get_shared_course_info | Get information about an course being shared | 1118 | courseid(int) | [{name,type,server,supportpageurl,issuerid,status,...}] | yes
core_moodlenet_get_share_info_activity | Get information about an activity being shared | 1121 | cmid(int) | [{name,type,server,supportpageurl,issuerid,status,...}] | yes
core_moodlenet_send_activity | Send activity to MoodleNet | 1124 | issuerid(int), cmid(int), shareformat(int) | [{status,resourceurl,Optional[],item,itemid,warningcode,message}] | yes
core_moodlenet_send_course | Send course to MoodleNet | 1127 | issuerid(int), courseid(int), shareformat(int) | [{status,resourceurl,Optional[],item,itemid,warningcode,message}] | yes
core_my_view_page | Trigger the My or Dashboard viewed event. | 1130 | page(string) | [{status,Optional[],item,itemid,warningcode,message}] | no
core_notes_create_notes | Create notes | 1132 | notes[](userid,publishstate,courseid,text,format,clientnoteid) | [{clientnoteid,noteid,errormessage}] | yes
core_notes_delete_notes | Delete notes | 1135 | (none) | [{Optional[],item,itemid,warningcode,message}] | no
core_notes_get_course_notes | Returns all notes in specified course (or site), for the specified user. | 1137 | courseid(int), userid(int) | [{id,courseid,userid,content,format,created,...}] | no
core_notes_get_notes | Get notes | 1143 | (none) | [{notes[],noteid,userid,publishstate,courseid,text,...}] | no
core_notes_update_notes | Update notes | 1146 | notes[](id,publishstate,text,format) | [{Optional[],item,itemid,warningcode,message}] | no
core_notes_view_notes | Simulates the web interface view of notes/index.php: trigger events. | 1148 | courseid(int), userid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
core_output_load_fontawesome_icon_system_map | Load the mapping of moodle pix names to fontawesome icon names | 1151 | themename(string) | [{component,pix,to}] | yes
core_output_load_template | Load a template for a renderable | 1153 | component(string), template(string), themename(string), includecomments(int) | {} | yes
core_output_load_template_with_dependencies | Load a template and its dependencies for a renderable | 1155 | component(string), template(string), themename(string), includecomments(int), lang(string) | {templates[],component,name,value,component,name,value} | yes
core_output_poll_stored_progress | Polls for the current percentage progress of a stored progress object | 1160 | (none) | [{id,uniqueid,progress,estimated,message,error,timeout}] | yes
core_payment_get_available_gateways | Get the list of payment gateways that support the given component/area | 1162 | component(string), paymentarea(string), itemid(int) | [{shortname,name,description,surcharge,cost}] | yes
core_question_get_random_question_summaries | Get the random question set for a criteria | 1165 | categoryid(int), includesubcategories(int), contextid(int), limit(int), offset(int) | {totalcount,questions[],id,category,parent,name,...} | yes
core_question_move_questions | Bulk move questions to a new category. | 1169 | newcontextid(int), newcategoryid(int), questionids(string), returnurl(string) | {} | yes
core_question_search_shared_banks | Get a list of shared question banks filtered by a search term. | 1172 | contextid(int), search(string) | [{value,label}] | yes
core_question_update_flag | Update the flag state of a question attempt. | 1174 | qubaid(int), questionid(int), qaid(int), slot(int), checksum(string), newstate(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
core_rating_add_rating | Rates an item. | 1178 | contextlevel(string), instanceid(int), component(string), ratingarea(string), itemid(int), scaleid(int), rating(int), rateduserid(int), aggregation(int) | [{success,aggregate,count,itemid,Optional[],item,...}] | no
core_rating_get_item_ratings | Retrieve all the ratings for an item. | 1183 | contextlevel(string), instanceid(int), component(string), ratingarea(string), itemid(int), scaleid(int), sort(string) | [{id,userid,userpictureurl,userfullname,rating,timemodified,...}] | no
core_reportbuilder_audiences_delete | Delete audience from report | 1189 | reportid(int), instanceid(int) | {} | yes
core_reportbuilder_can_view_system_report | Determine access to a system report | 1191 | source(string), component(string), area(string), itemid(int), parameters[](name,value) | {} | no
core_reportbuilder_columns_add | Add column to report | 1194 | reportid(int), uniqueidentifier(string) | [{hassortablecolumns,id,title,heading,sortdirection,sortenabled,...}] | yes
core_reportbuilder_columns_delete | Delete column from report | 1198 | reportid(int), columnid(int) | [{hassortablecolumns,id,title,heading,sortdirection,sortenabled,...}] | yes
core_reportbuilder_columns_reorder | Re-order column within report | 1201 | reportid(int), columnid(int), position(int) | {} | yes
core_reportbuilder_columns_sort_get | Retrieve column sorting for report | 1203 | reportid(int) | [{hassortablecolumns,id,title,heading,sortdirection,sortenabled,...}] | yes
core_reportbuilder_columns_sort_reorder | Re-order column sorting within report | 1206 | reportid(int), columnid(int), position(int) | [{hassortablecolumns,id,title,heading,sortdirection,sortenabled,...}] | yes
core_reportbuilder_columns_sort_toggle | Toggle sorting of column within report | 1210 | reportid(int), columnid(int), enabled(int), direction(int) | [{hassortablecolumns,id,title,heading,sortdirection,sortenabled,...}] | yes
core_reportbuilder_conditions_add | Add condition to report | 1214 | reportid(int), uniqueidentifier(string) | [{hasavailableconditions,text,value,visiblename,activeconditionsform,helpicon,javascript}] | yes
core_reportbuilder_conditions_delete | Delete condition from report | 1217 | reportid(int), conditionid(int) | [{hasavailableconditions,text,value,visiblename,activeconditionsform,helpicon,javascript}] | yes
core_reportbuilder_conditions_reorder | Re-order condition within report | 1221 | reportid(int), conditionid(int), position(int) | [{hasavailableconditions,text,value,visiblename,activeconditionsform,helpicon,javascript}] | yes
core_reportbuilder_conditions_reset | Reset conditions for given report | 1224 | reportid(int) | [{hasavailableconditions,text,value,visiblename,activeconditionsform,helpicon,javascript}] | yes
core_reportbuilder_filters_add | Add filter to report | 1227 | reportid(int), uniqueidentifier(string) | [{hasavailablefilters,text,value,visiblename,id,heading,...}] | yes
core_reportbuilder_filters_delete | Delete filter from report | 1231 | reportid(int), filterid(int) | [{hasavailablefilters,text,value,visiblename,id,heading,...}] | yes
core_reportbuilder_filters_reorder | Re-order filter within report | 1235 | reportid(int), filterid(int), position(int) | [{hasavailablefilters,text,value,visiblename,id,heading,...}] | no
core_reportbuilder_filters_reset | Reset filters for given report | 1240 | reportid(int), parameters(string) | {} | yes
core_reportbuilder_list_reports | List custom reports for current user | 1241 | page(int), perpage(int) | [{reports[],name,source,type,uniquerows,conditiondata,...}] | no
core_reportbuilder_reports_delete | Delete report | 1249 | reportid(int) | {} | yes
core_reportbuilder_reports_get | Get custom report | 1250 | reportid(int), editmode(int), pagesize(int) | [{name,source,type,uniquerows,conditiondata,settingsdata,...}] | yes
core_reportbuilder_retrieve_report | Retrieve custom report content | 1264 | reportid(int), page(int), perpage(int) | [{name,source,type,uniquerows,conditiondata,settingsdata,...}] | no
core_reportbuilder_retrieve_system_report | Retrieve system report content | 1273 | source(string), component(string), area(string), itemid(int), page(int), perpage(int), parameters[](name,value) | [{Optional[],item,itemid,warningcode,message}] | no
core_reportbuilder_schedules_delete | Delete schedule from report | 1279 | reportid(int), scheduleid(int) | {} | yes
core_reportbuilder_schedules_send | Send report schedule | 1281 | reportid(int), scheduleid(int) | {} | yes
core_reportbuilder_schedules_toggle | Toggle state of report schedule | 1283 | reportid(int), scheduleid(int), enabled(int) | {} | yes
core_reportbuilder_set_filters | Set filter values for given report | 1285 | reportid(int), parameters(string), values(string) | {} | yes
core_reportbuilder_view_report | Trigger custom report viewed | 1287 | reportid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
core_role_assign_roles | Manual role assignments. | 1289 | assignments[](roleid,userid,contextid,contextlevel,instanceid) | {} | no
core_role_unassign_roles | Manual role unassignments. | 1290 | unassignments[](roleid,userid,contextid,contextlevel,instanceid) | {} | no
core_search_get_relevant_users | Gets relevant users for a search request. | 1292 | query(string), courseid(int) | [{id,fullname,profileimageurlsmall}] | yes
core_search_get_results | Get search results. | 1294 | query(string), page(int) | {totalcount,results[],itemid,componentname,areaname,courseurl,...} | no
core_search_get_search_areas_list | Get search areas. | 1300 | cat(string) | [{id,categoryid,categoryname,name,Optional[],item,...}] | no
core_search_get_top_results | Get top search results. | 1303 | query(string) | {results[],itemid,componentname,areaname,courseurl,coursefullname,...} | no
core_search_view_results | Trigger view search results event. | 1308 | query(string), page(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
core_session_time_remaining | Count the seconds remaining in this session | 1312 | (none) | {userid,timeremaining} | yes
core_session_touch | Keep the users session alive | 1313 | (none) | {} | yes
core_sms_set_gateway_status | Set the sms gateway status | 1314 | plugin(int), state(int) | {result,message,messagetype} | yes
core_table_get_dynamic_table_content | Get the dynamic table content raw html | 1316 | component(string), handler(string), uniqueid(string), jointype(int), firstinitial(string), lastinitial(string), pagenumber(int), pagesize(int), resetpreferences(int), sortdata[](sortby,sortorder), filters[](name,jointype) | [{html,Optional[],item,itemid,warningcode,message}] | yes
core_tag_get_tag_areas | Retrieves existing tag areas. | 1323 | (none) | [{areas[],id,component,itemtype,enabled,tagcollid,...}] | no
core_tag_get_tag_cloud | Retrieves a tag cloud for the given collection and/or query search. | 1326 | tagcollid(int), isstandard(int), limit(int), sort(string), search(string), fromctx(int), ctx(int), rec(int) | [{tags[],name,viewurl,flag,isstandard,count,...}] | no
core_tag_get_tag_collections | Retrieves existing tag collections. | 1332 | (none) | [{collections[],id,name,isdefault,component,sortorder,...}] | no
core_tag_get_tagindex | Gets tag index page for one tag and one tag area | 1335 | (none) | {tagid,ta,component,itemtype,nextpageurl,prevpageurl,...} | no
core_tag_get_tagindex_per_area | Gets tag index page per different areas. | 1338 | (none) | [{tagid,ta,component,itemtype,nextpageurl,prevpageurl,...}] | no
core_tag_get_tags | Gets tags by their ids | 1341 | tags[](id) | [{tags[],id,tagcollid,name,rawname,description,...}] | yes
core_tag_update_tags | Updates tags | 1344 | tags[](id,rawname,description,descriptionformat,flag,official,isstandard) | [{Optional[],item,itemid,warningcode,message}] | yes
core_update_inplace_editable | Generic service to update title | 1347 | component(string), itemtype(string), itemid(string), value(string) | {displayvalue,component,itemtype,value,itemid,edithint,...} | yes
core_user_add_user_device | Store mobile user devices information for PUSH Notifications. | 1351 | appid(string), name(string), model(string), platform(string), version(string), pushid(string), uuid(string), publickey(string) | [{Optional[],item,itemid,warningcode,message}] | no
core_user_add_user_private_files | Copy files from a draft area to users private files area. | 1355 | draftid(int) | {} | no
core_user_agree_site_policy | Agree the site policy for the current user. | 1356 | (none) | [{status,Optional[],item,itemid,warningcode,message}] | no
core_user_create_users | Create users. | 1359 | users[](createpassword,username,auth,password,firstname,lastname,email,maildisplay,city,country,timezone,description,firstnamephonetic,lastnamephonetic,middlename,alternatename,interests,idnumber,institution,department,phone1,phone2,address,lang,calendartype,theme,mailformat) | [{id,username}] | no
core_user_delete_users | Delete users. | 1362 | (none) | {} | no
core_user_get_course_user_profiles | Get course user profiles (each of the profils matching a course id and a user id),. | 1364 | userlist[](userid,courseid) | [{id,username,firstname,lastname,fullname,email,...}] | no
core_user_get_private_files_info | Returns general information about files in the user private files area. | 1371 | userid(int) | [{filecount,foldercount,filesize,filesizewithoutreferences,Optional[],item,...}] | no
core_user_get_user_preferences | Return user preferences. | 1374 | name(string), userid(int) | [{name,value,Optional[],item,itemid,warningcode,message}] | yes
core_user_get_users | search for users matching the parameters | 1377 | criteria[](key,value) | [{users[],id,username,firstname,lastname,fullname,...}] | no
core_user_get_users_by_field | Retrieve users' information for a specified unique field - If you want to do a user search, | 1384 | field(string) | [{id,username,firstname,lastname,fullname,email,...}] | yes
core_user_prepare_private_files_for_edition | Prepares the draft area for user private files. | 1390 | (none) | [{draftitemid,name,value,Optional[],item,itemid,warningcode,message}] | no
core_user_remove_user_device | Remove a user device from the Moodle database. | 1392 | uuid(string), appid(string) | [{removed,Optional[],item,itemid,warningcode,message}] | no
core_user_search_identity | Return list of users identities matching the given criteria in their name or other identity | 1395 | query(string) | [{id,fullname,name,value,overflow}] | yes
core_user_set_user_preferences | Set user preferences. | 1397 | preferences[](name,value,userid) | [{name,userid,Optional[],item,itemid,warningcode,message}] | yes
core_user_update_picture | Update or delete the user picture in the site | 1400 | draftitemid(int), delete(int), userid(int) | [{success,profileimageurl,Optional[],item,itemid,warningcode,message}] | no
core_user_update_private_files | Copy files from a draft area to users private files area. | 1403 | draftitemid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
core_user_update_user_device_public_key | Store mobile user public key. | 1406 | uuid(string), appid(string), publickey(string) | [{status,Optional[],item,itemid,warningcode,message}] | no
core_user_update_user_preferences | Update a user's preferences | 1409 | userid(int), emailstop(int), preferences[](type,value) | {} | yes
core_user_update_users | Update users. | 1411 | users[](id,username,auth,suspended,password,firstname,lastname,email,maildisplay,city,country,timezone,description,userpicture,firstnamephonetic,lastnamephonetic,middlename,alternatename,interests,idnumber,institution,department,phone1,phone2,address,lang,calendartype,theme,mailformat) | [{Optional[],item,itemid,warningcode,message}] | yes
core_user_view_user_list | Simulates the web-interface view of user/index.php (triggering events),. | 1415 | courseid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
core_user_view_user_profile | Simulates the web-interface view of user/view.php and user/profile.php (triggering | 1418 | userid(int), courseid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
core_webservice_get_site_info | Return some site info / user info / list web service functions | 1420 | (none) | [{sitename,username,firstname,lastname,fullname,lang,...}] | no
core_xapi_delete_state | Delete an xAPI state data from an activityId. | 1426 | component(string), activityId(string), agent(string), stateId(string), registration(string) | {} | yes
core_xapi_delete_states | Delete all xAPI state data from an activityId. | 1428 | component(string), activityId(string), agent(string), registration(string) | {} | yes
core_xapi_get_state | Get an xAPI state data from an activityId. | 1430 | component(string), activityId(string), agent(string), stateId(string), registration(string) | {} | yes
core_xapi_get_states | Get all state ID from an activityId. | 1433 | component(string), activityId(string), agent(string), registration(string), since(string) | {} | yes
core_xapi_post_state | Post an xAPI state into an activityId. | 1436 | component(string), activityId(string), agent(string), stateId(string), stateData(string), registration(string) | {} | yes
core_xapi_statement_post | Post an xAPI statement. | 1439 | component(string), requestjson(string) | {} | yes
customfield_number_recalculate_value | This web service is used to recalculate the value of automatically populated number | 1441 | fieldid(int), instanceid(int), component(string), area(string), itemid(int) | {value} | yes
editor_tiny_get_configuration | Returns the TinyMCE configuration for a context. | 1444 | contextlevel(string), instanceid(int) | [{contextid,branding,extendedvalidelements,lang,name,name,...}] | no
enrol_guest_get_instance_info | Return guest enrolment instance information. | 1448 | instanceid(int) | [{id,courseid,type,name,status,passwordrequired,...}] | no
enrol_guest_validate_password | Perform password validation. | 1451 | instanceid(int), password(string) | [{validated,hint,Optional[],item,itemid,warningcode,message}] | no
enrol_manual_enrol_users | Manual enrol users | 1454 | enrolments[](roleid,userid,courseid,timestart,timeend,suspend) | {} | no
enrol_manual_unenrol_users | Manual unenrol users | 1455 | enrolments[](userid,courseid,roleid) | {} | no
enrol_meta_add_instances | Add meta enrolment instances | 1457 | instances[](metacourseid,courseid,creategroup) | [{metacourseid,courseid,status}] | yes
enrol_meta_delete_instances | Delete meta enrolment instances | 1459 | instances[](metacourseid,courseid) | [{metacourseid,courseid,status}] | yes
enrol_self_enrol_user | Self enrol the current user in the given course. | 1461 | courseid(int), password(string), instanceid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
enrol_self_get_instance_info | self enrolment instance information. | 1464 | instanceid(int) | {id,courseid,type,name,status,enrolpassword} | no
gradereport_grader_get_users_in_report | Returns the dataset of users within the report | 1466 | courseid(int) | [{users[],id,username,firstname,lastname,fullname,...}] | yes
gradereport_overview_get_course_grades | Get the given user courses final grades | 1472 | userid(int) | [{grades[],courseid,grade,rawgrade,rank,Optional[],...}] | no
gradereport_overview_view_grade_report | Trigger the report view event | 1475 | courseid(int), userid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
gradereport_singleview_get_grade_items_for_search_widget | Get the gradeitem/(s) for a course | 1478 | courseid(int) | [{gradeitems[],id,name,Optional[],item,itemid,warningcode,message}] | yes
gradereport_user_get_access_information | Returns user access information for the user grade report. | 1480 | courseid(int) | [{canviewusergradereport,canviewmygrades,canviewallgrades,Optional[],item,itemid,warningcode,message}] | no
gradereport_user_get_grade_items | Returns the complete list of grade items for users in a course | 1483 | courseid(int), userid(int), groupid(int) | [{usergrades[],courseid,courseidnumber,userid,userfullname,useridnumber,...}] | no
gradereport_user_get_grades_table | Get the user/s report grades table for a course | 1490 | courseid(int), userid(int), groupid(int) | [{tables[],courseid,userid,userfullname,maxdepth,tabledata[],...}] | no
gradereport_user_view_grade_report | Trigger the report view event | 1499 | courseid(int), userid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
gradingform_guide_grader_gradingpanel_fetch | Fetch the data required to display the grader grading panel, creating the grade item if | 1501 | component(string), contextid(int), itemname(string), gradeduserid(int) | [{templatename,hasgrade,instanceid,id,name,maxscore,...}] | yes
gradingform_guide_grader_gradingpanel_store | Store the grading data for a user from the grader grading panel. | 1507 | component(string), contextid(int), itemname(string), gradeduserid(int), notifyuser(int), formdata(string) | [{templatename,hasgrade,instanceid,id,name,maxscore,...}] | yes
gradingform_rubric_grader_gradingpanel_fetch | Fetch the data required to display the grader grading panel, creating the grade item if | 1513 | component(string), contextid(int), itemname(string), gradeduserid(int) | [{templatename,hasgrade,instanceid,rubricmode,canedit,criteria[],...}] | yes
gradingform_rubric_grader_gradingpanel_store | Store the grading data for a user from the grader grading panel. | 1519 | component(string), contextid(int), itemname(string), gradeduserid(int), notifyuser(int), formdata(string) | [{templatename,hasgrade,instanceid,rubricmode,canedit,criteria[],...}] | yes
media_videojs_get_language | get language. | 1525 | lang(string) | {} | yes
message_airnotifier_are_notification_preferences_configured | Check if the users have notification preferences configured yet | 1526 | (none) | [{userid,configured,Optional[],item,itemid,warningcode,message}] | no
message_airnotifier_enable_device | Enables or disables a registered user device so it can receive Push notifications | 1529 | deviceid(int), enable(int) | [{success,Optional[],item,itemid,warningcode,message}] | no
message_airnotifier_get_user_devices | Return the list of mobile devices that are registered in Moodle for the given user | 1532 | appid(string), userid(int) | [{id,appid,name,model,platform,version,...}] | no
message_airnotifier_is_system_configured | Check whether the airnotifier settings have been configured | 1536 | (none) | {} | no
message_popup_get_popup_notifications | Retrieve a list of popup notifications for a user | 1537 | useridto(int), newestfirst(int), limit(int), offset(int) | {notifications[],id,useridfrom,useridto,subject,shortenedsubject,...} | yes
message_popup_get_unread_popup_notification_count | Retrieve the count of unread popup notifications for a given user | 1542 | useridto(int) | {} | yes
mod_assign_copy_previous_attempt | Copy a students previous attempt to a new attempt. | 1543 | assignmentid(int) | [{Optional[],item,itemid,warningcode,message}] | no
mod_assign_get_assignments | Returns the courses and assignments for the users capability | 1545 | includenotenrolledcourses(int) | [{id,fullname,shortname,timemodified,id,cmid,...}] | no
mod_assign_get_grades | Returns grades from the assignment | 1557 | since(int) | [{assignmentid,grades[],id,assignment,userid,attemptnumber,...}] | no
mod_assign_get_participant | Get a participant for an assignment, with some summary info about their submissions. | 1561 | assignid(int), userid(int), embeduser(int) | [{id,fullname,submitted,requiregrading,grantedextension,blindmarking,...}] | yes
mod_assign_get_submissions | Returns the submissions for assignments | 1569 | status(string), since(int), before(int) | [{assignmentid,submissions[],id,userid,attemptnumber,timecreated,...}] | no
mod_assign_get_submission_status | Returns information about an assignment submission status for a given user. | 1576 | assignid(int), userid(int), groupid(int) | [{participantcount,submissiondraftscount,submissionsenabled,submissionssubmittedcount,submissionsneedgradingcount,warnofungroupedusers,...}] | no
mod_assign_get_user_flags | Returns the user flags for assignments | 1604 | (none) | [{assignmentid,userflags[],id,userid,locked,mailed,...}] | no
mod_assign_get_user_mappings | Returns the blind marking mappings for assignments | 1608 | (none) | [{assignmentid,mappings[],id,userid,Optional[],item,...}] | no
mod_assign_list_participants | List the participants for a single assignment, with some summary info about their | 1611 | assignid(int), groupid(int), filter(string), skip(int), limit(int), onlyids(int), includeenrolments(int), tablesort(int) | [{id,username,firstname,lastname,fullname,email,...}] | yes
mod_assign_lock_submissions | Prevent students from making changes to a list of submissions | 1620 | assignmentid(int) | [{Optional[],item,itemid,warningcode,message}] | no
mod_assign_remove_submission | Remove submission. | 1623 | userid(int), assignid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_assign_reveal_identities | Reveal the identities for a blind marking assignment | 1625 | assignmentid(int) | [{Optional[],item,itemid,warningcode,message}] | no
mod_assign_revert_submissions_to_draft | Reverts the list of submissions to draft status | 1627 | assignmentid(int) | [{Optional[],item,itemid,warningcode,message}] | no
mod_assign_save_grade | Save a grade update for a single student. | 1630 | assignmentid(int), userid(int), grade(double), attemptnumber(int), addattempt(int), workflowstate(string), applytoall(int) | {} | no
mod_assign_save_grades | Save multiple grade updates for an assignment. | 1636 | assignmentid(int), applytoall(int), grades[](userid,grade,attemptnumber,addattempt,workflowstate) | {} | no
mod_assign_save_submission | Update the current students submission | 1640 | assignmentid(int) | [{Optional[],item,itemid,warningcode,message}] | no
mod_assign_save_user_extensions | Save a list of assignment extensions | 1643 | assignmentid(int) | [{Optional[],item,itemid,warningcode,message}] | no
mod_assign_set_user_flags | Creates or updates user flags | 1646 | assignmentid(int), userflags[](userid,locked,mailed,extensionduedate,workflowstate,allocatedmarker) | [{id,userid,errormessage}] | no
mod_assign_start_submission | Start a submission for user if assignment has a time limit. | 1648 | assignid(int) | [{submissionid,Optional[],item,itemid,warningcode,message}] | no
mod_assign_submit_for_grading | Submit the current students assignment for grading | 1651 | assignmentid(int), acceptsubmissionstatement(int) | [{Optional[],item,itemid,warningcode,message}] | no
mod_assign_submit_grading_form | Submit the grading form data via ajax | 1653 | assignmentid(int), userid(int), jsonformdata(string) | [{Optional[],item,itemid,warningcode,message}] | yes
mod_assign_unlock_submissions | Allow students to make changes to a list of submissions | 1656 | assignmentid(int) | [{Optional[],item,itemid,warningcode,message}] | no
mod_assign_view_assign | Update the module completion status. | 1658 | assignid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_assign_view_grading_table | Trigger the grading_table_viewed event. | 1661 | assignid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_assign_view_submission_status | Trigger the submission status viewed event. | 1663 | assignid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_bigbluebuttonbn_can_join | Returns information if the current user can join or not. | 1665 | cmid(int), groupid(int) | {can_join,cmid} | no
mod_bigbluebuttonbn_completion_validate | Validate completion | 1667 | bigbluebuttonbnid(int) | [{Optional[],item,itemid,warningcode,message}] | yes
mod_bigbluebuttonbn_end_meeting | End a meeting | 1669 | bigbluebuttonbnid(int), groupid(int) | [{Optional[],item,itemid,warningcode,message}] | yes
mod_bigbluebuttonbn_get_bigbluebuttonbns_by_courses | Returns a list of bigbluebuttonbns in a provided list of courses, if no list is provided all | 1672 | (none) | [{bigbluebuttonbns[],id,coursemodule,course,name,intro,...}] | no
mod_bigbluebuttonbn_get_join_url | Get the join URL for the meeting and create if it does not exist. | 1677 | cmid(int), groupid(int) | [{join_url,Optional[],item,itemid,warningcode,message}] | no
mod_bigbluebuttonbn_get_recordings | Returns a list of recordings ready to be processed by a datatable. | 1679 | bigbluebuttonbnid(int), tools(string), groupid(int) | [{status,activity,key,sortable,allowHTML,formatter,...}] | yes
mod_bigbluebuttonbn_get_recordings_to_import | Returns a list of recordings ready to import to be processed by a datatable. | 1684 | destinationinstanceid(int), sourcebigbluebuttonbnid(int), sourcecourseid(int), tools(string), groupid(int) | [{status,activity,key,sortable,allowHTML,formatter,...}] | yes
mod_bigbluebuttonbn_meeting_info | Get displayable information on the meeting | 1689 | bigbluebuttonbnid(int), groupid(int), updatecache(int) | [{cmid,userlimit,bigbluebuttonbnid,groupid,meetingid,openingtime,...}] | yes
mod_bigbluebuttonbn_update_recording | Update a single recording | 1694 | bigbluebuttonbnid(int), recordingid(int), action(string), additionaloptions(string) | {} | no
mod_bigbluebuttonbn_view_bigbluebuttonbn | Trigger the course module viewed event and update the module completion status. | 1697 | bigbluebuttonbnid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_book_get_books_by_courses | Returns a list of book instances in a provided set of courses, if no courses are provided | 1699 | (none) | [{books[],id,coursemodule,course,name,intro,...}] | no
mod_book_view_book | Simulate the view.php web interface book: trigger events, completion, etc... | 1704 | bookid(int), chapterid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_choice_delete_choice_responses | Delete the given submitted responses in a choice | 1707 | choiceid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_choice_get_choice_options | Retrieve options for a specific choice. | 1710 | choiceid(int) | [{id,text,maxanswers,displaylayout,countanswers,checked,...}] | no
mod_choice_get_choice_results | Retrieve users results for a given choice. | 1713 | choiceid(int), groupid(int) | [{options[],id,text,maxanswer,userresponses[],userid,...}] | no
mod_choice_get_choices_by_courses | Returns a list of choice instances in a provided set of courses, if no courses are provided | 1717 | (none) | [{choices[],id,coursemodule,course,name,intro,...}] | no
mod_choice_submit_choice_response | Submit responses to a specific choice item. | 1723 | choiceid(int) | [{answers[],id,choiceid,userid,optionid,timemodified,...}] | no
mod_choice_view_choice | Trigger the course module viewed event and update the module completion status. | 1726 | choiceid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_data_add_entry | Adds a new entry. | 1728 | databaseid(int), groupid(int), data[](fieldid,subfield,value) | [{newentryid,generalnotifications[],fieldname,notification,Optional[],item,...}] | no
mod_data_approve_entry | Approves or unapproves an entry. | 1732 | entryid(int), approve(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_data_delete_entry | Deletes an entry. | 1735 | entryid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_data_delete_saved_preset | Delete site user preset. | 1737 | dataid(int) | [{result,Optional[],item,itemid,warningcode,message}] | yes
mod_data_get_data_access_information | Return access information for a given database. | 1740 | databaseid(int), groupid(int) | [{groupid,canaddentry,canmanageentries,canapprove,timeavailable,inreadonlyperiod,...}] | no
mod_data_get_databases_by_courses | Returns a list of database instances in a provided set of courses, if no courses are provided | 1743 | (none) | [{databases[],id,course,name,intro,introformat,...}] | no
mod_data_get_entries | Return the complete list of entries of the given database. | 1750 | databaseid(int), groupid(int), returncontents(int), sort(int), order(string), page(int), perpage(int) | [{entries[],id,userid,groupid,dataid,timecreated,...}] | no
mod_data_get_entry | Return one entry record from the database, including contents optionally. | 1759 | entryid(int), returncontents(int) | [{id,userid,groupid,dataid,timecreated,timemodified,...}] | no
mod_data_get_fields | Return the list of configured fields for the given database. | 1769 | databaseid(int) | [{fields[],id,dataid,type,name,description,...}] | no
mod_data_get_mapping_information | Get importing information | 1773 | cmid(int), importedpreset(string) | [{needsmapping,presetname,fieldstocreate,fieldstoremove,Optional[],item,...}] | yes
mod_data_search_entries | Search for entries in the given database. | 1777 | databaseid(int), groupid(int), returncontents(int), search(string), sort(int), order(string), page(int), perpage(int), advsearch[](name,value) | [{entries[],id,userid,groupid,dataid,timecreated,...}] | no
mod_data_update_entry | Updates an existing entry. | 1787 | entryid(int), data[](fieldid,subfield,value) | [{updated,generalnotifications[],fieldname,notification,Optional[],item,...}] | no
mod_data_view_database | Simulate the view.php web interface data: trigger events, completion, etc... | 1790 | databaseid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_feedback_get_analysis | Retrieves the feedback analysis. | 1793 | feedbackid(int), groupid(int), courseid(int) | [{completedcount,itemscount,itemsdata[],id,feedback,template,...}] | no
mod_feedback_get_current_completed_tmp | Returns the temporary completion record for the current user. | 1800 | feedbackid(int), courseid(int) | [{id,feedback,userid,guestid,timemodified,random_response,...}] | no
mod_feedback_get_feedback_access_information | Return access information for a given feedback. | 1803 | feedbackid(int), courseid(int) | [{canviewanalysis,cancomplete,cansubmit,candeletesubmissions,canviewreports,canedititems,...}] | no
mod_feedback_get_feedbacks_by_courses | Returns a list of feedbacks in a provided list of courses, if no list is provided all feedbacks | 1807 | (none) | [{feedbacks[],id,course,name,intro,introformat,...}] | no
mod_feedback_get_finished_responses | Retrieves responses from the last finished attempt. | 1813 | feedbackid(int), courseid(int) | [{responses[],id,course_id,item,completed,tmp_completed,...}] | no
mod_feedback_get_items | Returns the items (questions) in the given feedback. | 1816 | feedbackid(int), courseid(int) | [{items[],id,feedback,template,name,nameformat,...}] | no
mod_feedback_get_last_completed | Retrieves the last completion record for the current user. | 1823 | feedbackid(int), courseid(int) | [{id,feedback,userid,timemodified,random_response,anonymous_response,...}] | no
mod_feedback_get_non_respondents | Retrieves a list of students who didn't submit the feedback. | 1826 | feedbackid(int), groupid(int), sort(string), page(int), perpage(int), courseid(int) | [{users[],courseid,userid,fullname,started,Optional[],...}] | no
mod_feedback_get_page_items | Get a single feedback page items. | 1830 | feedbackid(int), page(int), courseid(int) | [{items[],id,feedback,template,name,nameformat,...}] | no
mod_feedback_get_responses_analysis | Return the feedback user responses analysis. | 1837 | feedbackid(int), groupid(int), page(int), perpage(int), courseid(int) | [{attempts[],id,courseid,userid,timemodified,fullname,...}] | no
mod_feedback_get_unfinished_responses | Retrieves responses from the current unfinished attempt. | 1844 | feedbackid(int), courseid(int) | [{responses[],id,course_id,item,completed,tmp_completed,...}] | no
mod_feedback_launch_feedback | Starts or continues a feedback submission. | 1847 | feedbackid(int), courseid(int) | [{gopage,Optional[],item,itemid,warningcode,message}] | no
mod_feedback_process_page | Process a jump between pages. | 1849 | feedbackid(int), page(int), goprevious(int), courseid(int), responses[](name,value) | [{jumpto,completed,completionpagecontents,siteaftersubmit,Optional[],item,...}] | no
mod_feedback_questions_reorder | Saves the new order of the questions in the feedback. | 1854 | cmid(int), itemorder(string) | {} | yes
mod_feedback_view_feedback | Trigger the course module viewed event and update the module completion status. | 1855 | feedbackid(int), moduleviewed(int), courseid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_folder_get_folders_by_courses | Returns a list of folders in a provided list of courses, if no list is provided all folders that the | 1858 | (none) | [{folders[],id,coursemodule,course,name,intro,...}] | no
mod_folder_view_folder | Simulate the view.php web interface folder: trigger events, completion, etc... | 1864 | folderid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_forum_add_discussion | Add a new discussion into an existing forum. | 1866 | forumid(int), subject(string), message(string), groupid(int), options[](name,value) | [{discussionid,Optional[],item,itemid,warningcode,message}] | no
mod_forum_add_discussion_post | Create new posts into an existing discussion. | 1870 | postid(int), subject(string), message(string), messageformat(int), options[](name,value) | [{postid,Optional[],item,itemid,warningcode,message,...}] | yes
mod_forum_can_add_discussion | Check if the current user can add discussions in the given forum (and optionally for the | 1886 | forumid(int), groupid(int) | [{status,canpindiscussions,cancreateattachment,Optional[],item,itemid,warningcode,message}] | no
mod_forum_delete_post | Deletes a post or a discussion completely when the post is the discussion topic. | 1889 | postid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_forum_get_discussion_post | Get a particular discussion post. | 1891 | postid(int) | [{id,subject,replysubject,message,messageformat,id,...}] | no
mod_forum_get_discussion_posts | Returns a list of forum posts for a discussion. | 1904 | discussionid(int), sortby(string), sortdirection(string), includeinlineattachments(int) | [{posts[],id,subject,replysubject,message,messageformat,...}] | yes
mod_forum_get_discussion_posts_by_userid | Returns a list of forum posts for a discussion for a user. | 1922 | userid(int), cmid(int), sortby(string), sortdirection(string) | [{discussions[],name,id,timecreated,authorfullname,userposts[],...}] | yes
mod_forum_get_forum_access_information | Return capabilities information for a given forum. | 1948 | forumid(int) | [{Optional[],item,itemid,warningcode,message,canviewdiscussion,...}] | no
mod_forum_get_forum_discussions | Returns a list of forum discussions optionally sorted and paginated. | 1954 | forumid(int), sortorder(int), page(int), perpage(int), groupid(int) | [{discussions[],id,name,groupid,timemodified,usermodified,...}] | no
mod_forum_get_forums_by_courses | Returns a list of forum instances in a provided set of courses, if no courses are provided | 1963 | (none) | [{id,course,type,name,intro,introformat,...}] | no
mod_forum_prepare_draft_area_for_post | Prepares a draft area for editing a post. | 1969 | postid(int), area(string), draftitemid(int), filestokeep[](filename,filepath) | [{draftitemid,filename,filepath,filesize,fileurl,timemodified,...}] | no
mod_forum_set_forum_subscription | Subscribe or unsubscribe the user to a forum. | 1974 | forumid(int), targetstate(int) | {id,name,groupmode,gradingenabled,tracked,subscribed,...} | yes
mod_forum_set_forum_tracking | Track or not unread messages in a forum for the user. | 1979 | forumid(int), targetstate(int) | {id,name,groupmode,gradingenabled,tracked,subscribed,...} | yes
mod_forum_set_lock_state | Set the lock state for the discussion | 1984 | forumid(int), discussionid(int), targetstate(int) | {id,locked,locked} | yes
mod_forum_set_pin_state | Set the pin state | 1987 | discussionid(int), targetstate(int) | {id,forumid,pinned,locked,istimelocked,name,...} | yes
mod_forum_set_subscription_state | Set the subscription state | 1992 | forumid(int), discussionid(int), targetstate(int) | {id,forumid,pinned,locked,istimelocked,name,...} | yes
mod_forum_toggle_favourite_state | Toggle the favourite state | 1998 | discussionid(int), targetstate(int) | {id,forumid,pinned,locked,istimelocked,name,...} | yes
mod_forum_update_discussion_post | Updates a post or a discussion topic post. | 2004 | postid(int), subject(string), message(string), messageformat(int), options[](name,value) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_forum_view_forum | Trigger the course module viewed event and update the module completion status. | 2008 | forumid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_forum_view_forum_discussion | Trigger the forum discussion viewed event. | 2010 | discussionid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_glossary_add_entry | Add a new entry to a given glossary | 2012 | glossaryid(int), concept(string), definition(string), definitionformat(int), options[](name,value) | [{entryid,Optional[],item,itemid,warningcode,message}] | no
mod_glossary_delete_entry | Delete the given entry from the glossary. | 2016 | entryid(int) | [{result,Optional[],item,itemid,warningcode,message}] | no
mod_glossary_get_authors | Get the authors. | 2018 | id(int), from(int), limit(int) | [{count,authors[],id,fullname,pictureurl,Optional[],...}] | no
mod_glossary_get_categories | Get the categories. | 2022 | id(int), from(int), limit(int) | [{count,categories[],id,glossaryid,name,usedynalink,...}] | no
mod_glossary_get_entries_by_author | Browse entries by author. | 2026 | id(int), letter(string), field(string), sort(string), from(int), limit(int) | [{count,entries[],id,glossaryid,userid,userfullname,...}] | no
mod_glossary_get_entries_by_author_id | Browse entries by author ID. | 2039 | id(int), authorid(int), order(string), sort(string), from(int), limit(int) | [{count,entries[],id,glossaryid,userid,userfullname,...}] | no
mod_glossary_get_entries_by_category | Browse entries by category. | 2052 | id(int), categoryid(int), from(int), limit(int) | [{count,entries[],id,glossaryid,userid,userfullname,...}] | no
mod_glossary_get_entries_by_date | Browse entries by date. | 2064 | id(int), order(string), sort(string), from(int), limit(int) | [{count,entries[],id,glossaryid,userid,userfullname,...}] | no
mod_glossary_get_entries_by_letter | Browse entries by letter. | 2077 | id(int), letter(string), from(int), limit(int) | [{count,entries[],id,glossaryid,userid,userfullname,...}] | no
mod_glossary_get_entries_by_search | Browse entries by search query. | 2089 | id(int), query(string), fullsearch(int), order(string), sort(string), from(int), limit(int) | [{count,entries[],id,glossaryid,userid,userfullname,...}] | no
mod_glossary_get_entries_by_term | Browse entries by term (concept or alias). | 2102 | id(int), term(string), from(int), limit(int) | [{count,entries[],id,glossaryid,userid,userfullname,...}] | no
mod_glossary_get_entries_to_approve | Browse entries to be approved. | 2115 | id(int), letter(string), order(string), sort(string), from(int), limit(int) | [{count,entries[],id,glossaryid,userid,userfullname,...}] | no
mod_glossary_get_entry_by_id | Get an entry by ID | 2127 | id(int) | [{id,glossaryid,userid,userfullname,userpictureurl,concept,...}] | yes
mod_glossary_get_glossaries_by_courses | Retrieve a list of glossaries from several courses. | 2138 | (none) | [{glossaries[],id,coursemodule,course,name,intro,...}] | no
mod_glossary_prepare_entry_for_edition | Prepares the given entry for edition returning draft item areas and file areas information. | 2146 | entryid(int) | [{inlineattachmentsid,attachmentsid,area,name,value,Optional[],...}] | no
mod_glossary_update_entry | Updates the given glossary entry. | 2149 | entryid(int), concept(string), definition(string), definitionformat(int), options[](name,value) | [{result,Optional[],item,itemid,warningcode,message}] | no
mod_glossary_view_entry | Notify a glossary entry as being viewed. | 2153 | id(int) | [{status,Optional[],item,itemid,warningcode,message}] | yes
mod_glossary_view_glossary | Notify the glossary as being viewed. | 2155 | id(int), mode(string) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_h5pactivity_get_attempts | Return the information needed to list a user attempts. | 2159 | h5pactivityid(int) | [{activityid,userid,id,h5pactivityid,userid,timecreated,...}] | no
mod_h5pactivity_get_h5pactivities_by_courses | Returns a list of h5p activities in a list of provided courses, if no list is provided all h5p | 2165 | (none) | [{h5pactivities[],id,course,name,timecreated,timemodified,...}] | no
mod_h5pactivity_get_h5pactivity_access_information | Return access information for a given h5p activity. | 2172 | h5pactivityid(int) | [{Optional[],item,itemid,warningcode,message,canaddinstance,cansubmit,canreviewattempts}] | no
mod_h5pactivity_get_results | Return the information needed to list a user attempt results. | 2174 | h5pactivityid(int) | [{activityid,id,h5pactivityid,userid,timecreated,timemodified,...}] | no
mod_h5pactivity_get_user_attempts | Return the information needed to list all enrolled user attempts. | 2183 | h5pactivityid(int), sortorder(string), page(int), perpage(int), firstinitial(string), lastinitial(string) | [{activityid,userid,id,h5pactivityid,userid,timecreated,...}] | no
mod_h5pactivity_log_report_viewed | Log that the h5pactivity was viewed. | 2190 | h5pactivityid(int), userid(int), attemptid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_h5pactivity_view_h5pactivity | Trigger the course module viewed event and update the module completion status. | 2193 | h5pactivityid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_imscp_get_imscps_by_courses | Returns a list of IMSCP instances in a provided set of courses, if no courses are provided | 2195 | (none) | [{imscps[],id,coursemodule,course,name,intro,...}] | no
mod_imscp_view_imscp | Simulate the view.php web interface imscp: trigger events, completion, etc... | 2201 | imscpid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_label_get_labels_by_courses | Returns a list of labels in a provided list of courses, if no list is provided all labels that the | 2203 | (none) | [{labels[],id,coursemodule,course,name,intro,...}] | no
mod_lesson_finish_attempt | Finishes the current attempt. | 2208 | lessonid(int), password(string), outoftime(int), review(int) | [{name,value,message,message,type,Optional[],...}] | no
mod_lesson_get_attempts_overview | Get a list of all the attempts made by users in a lesson. | 2212 | lessonid(int), groupid(int) | [{lessonscored,numofattempts,avescore,highscore,lowscore,avetime,...}] | no
mod_lesson_get_content_pages_viewed | Return the list of content pages viewed by a user during a lesson attempt. | 2217 | lessonid(int), lessonattempt(int), userid(int) | [{pages[],id,lessonid,pageid,userid,retry,...}] | no
mod_lesson_get_lesson | Return information of a given lesson. | 2221 | lessonid(int), password(string) | [{id,course,coursemodule,name,intro,introformat,...}] | no
mod_lesson_get_lesson_access_information | Return access information for a given lesson. | 2230 | lessonid(int) | [{canmanage,cangrade,canviewreports,reviewmode,attemptscount,lastpageseen,...}] | no
mod_lesson_get_lessons_by_courses | Returns a list of lessons in a provided list of courses, if no list is provided all lessons that | 2233 | (none) | [{lessons[],id,course,coursemodule,name,intro,...}] | no
mod_lesson_get_page_data | Return information of a given page, including its contents. | 2242 | lessonid(int), pageid(int), password(string), review(int), returncontents(int) | [{id,lessonid,prevpageid,nextpageid,qtype,qoption,...}] | no
mod_lesson_get_pages | Return the list of pages in a lesson (based on the user permissions). | 2252 | lessonid(int), password(string) | [{pages[],id,lessonid,prevpageid,nextpageid,qtype,...}] | no
mod_lesson_get_pages_possible_jumps | Return all the possible jumps for the pages in a given lesson. | 2258 | lessonid(int) | [{jumps[],pageid,answerid,jumpto,calculatedjump,Optional[],...}] | no
mod_lesson_get_questions_attempts | Return the list of questions attempts in a given lesson. | 2260 | lessonid(int), attempt(int), correct(int), pageid(int), userid(int) | [{attempts[],id,lessonid,pageid,userid,answerid,...}] | no
mod_lesson_get_user_attempt | Return information about the given user attempt (including answers). | 2265 | lessonid(int), userid(int), lessonattempt(int) | [{answerpages[],id,lessonid,prevpageid,nextpageid,qtype,...}] | no
mod_lesson_get_user_attempt_grade | Return grade information in the attempt for a given user. | 2272 | lessonid(int), lessonattempt(int), userid(int) | [{nquestions,attempts,total,earned,grade,nmanual,...}] | no
mod_lesson_get_user_grade | Return the final grade in the lesson for the given user. | 2276 | lessonid(int), userid(int) | [{grade,formattedgrade,Optional[],item,itemid,warningcode,message}] | no
mod_lesson_get_user_timers | Return the timers in the current lesson for the given user. | 2278 | lessonid(int), userid(int) | [{timers[],id,lessonid,userid,starttime,lessontime,...}] | no
mod_lesson_launch_attempt | Starts a new attempt or continues an existing one. | 2282 | lessonid(int), password(string), pageid(int), review(int) | [{messages[],message,type,Optional[],item,itemid,warningcode,message}] | no
mod_lesson_process_page | Processes page responses. | 2285 | lessonid(int), pageid(int), password(string), review(int), data[](name,value) | [{newpageid,inmediatejump,nodefaultresponse,feedback,attemptsremaining,correctanswer,...}] | no
mod_lesson_view_lesson | Trigger the course module viewed event and update the module completion status. | 2292 | lessonid(int), password(string) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_lti_create_tool_proxy | Create a tool proxy | 2295 | name(string), regurl(string) | {id,name,regurl,state,guid,secret,...} | yes
mod_lti_create_tool_type | Create a tool type | 2299 | cartridgeurl(string), key(string), secret(string) | [{id,name,description,platformid,clientid,deploymentid,...}] | yes
mod_lti_delete_course_tool_type | Delete a course tool type | 2304 | tooltypeid(int) | {} | yes
mod_lti_delete_tool_proxy | Delete a tool proxy | 2306 | id(int) | {id,name,regurl,state,guid,secret,...} | yes
mod_lti_delete_tool_type | Delete a tool type | 2308 | id(int) | {id} | yes
mod_lti_get_ltis_by_courses | Returns a list of external tool instances in a provided set of courses, if no courses are | 2310 | (none) | [{ltis[],id,coursemodule,course,name,intro,...}] | no
mod_lti_get_tool_launch_data | Return the launch data for a given external tool. | 2316 | toolid(int) | [{endpoint,parameters[],name,value,Optional[],item,...}] | no
mod_lti_get_tool_proxies | Get a list of the tool proxies | 2319 | orphanedonly(int) | [{id,name,regurl,state,guid,secret,...}] | yes
mod_lti_get_tool_proxy_registration_request | Get a registration request for a tool proxy | 2322 | id(int) | {lti_message_type,lti_version,reg_key,reg_password,reg_url,tc_profile_url,launch_presentation_return_url} | yes
mod_lti_get_tool_types | Get a list of the tool types | 2324 | toolproxyid(int) | [{id,name,description,platformid,clientid,deploymentid,...}] | yes
mod_lti_get_tool_types_and_proxies | Get a list of the tool types and tool proxies | 2329 | toolproxyid(int), orphanedonly(int), limit(int), offset(int) | [{types[],id,name,description,platformid,clientid,...}] | yes
mod_lti_get_tool_types_and_proxies_count | Get total number of the tool types and tool proxies | 2336 | toolproxyid(int), orphanedonly(int) | {count} | yes
mod_lti_is_cartridge | Determine if the given url is for a cartridge | 2337 | url(string) | {iscartridge} | yes
mod_lti_toggle_showinactivitychooser | Toggle showinactivitychooser for a tool type in a course | 2339 | tooltypeid(int), courseid(int), showinactivitychooser(int) | {} | yes
mod_lti_update_tool_type | Update a tool type | 2341 | id(int), name(string), description(string), state(int) | [{id,name,description,platformid,clientid,deploymentid,...}] | yes
mod_lti_view_lti | Trigger the course module viewed event and update the module completion status. | 2346 | ltiid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_page_get_pages_by_courses | Returns a list of pages in a provided list of courses, if no list is provided all pages that the | 2348 | (none) | [{pages[],id,coursemodule,course,name,intro,...}] | no
mod_page_view_page | Simulate the view.php web interface page: trigger events, completion, etc... | 2355 | pageid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_quiz_add_random_questions | Add a number of random questions to a quiz. | 2357 | cmid(int), addonpage(int), randomcount(int), filtercondition(string), newcategory(string), parentcategory(string) | {message} | yes
mod_quiz_create_grade_item_per_section | For a quiz with no grade items yet, create a grade item for each section, with the questions | 2361 | quizid(int) | {} | yes
mod_quiz_create_grade_items | Create quiz grade items. All grade items must belong to the same quiz. | 2362 | quizid(int), quizgradeitems[](name) | {} | yes
mod_quiz_delete_grade_items | Delete quiz grade items. All grade items must belong to the same quiz. | 2363 | quizid(int), quizgradeitems[](id) | {} | yes
mod_quiz_delete_overrides | Delete quiz overrides | 2365 | (none) | {ids[]} | yes
mod_quiz_get_attempt_access_information | Return access information for a given attempt in a quiz. | 2367 | quizid(int), attemptid(int) | [{endtime,isfinished,ispreflightcheckrequired,Optional[],item,itemid,warningcode,message}] | no
mod_quiz_get_attempt_data | Returns information for the given attempt page for a quiz attempt in progress. | 2370 | attemptid(int), page(int), preflightdata[](name,value) | [{id,quiz,userid,attempt,uniqueid,layout,...}] | no
mod_quiz_get_attempt_review | Returns review information for the given finished attempt, can be used by users or | 2380 | attemptid(int), page(int) | [{grade,id,quiz,userid,attempt,uniqueid,...}] | no
mod_quiz_get_attempt_summary | Returns a summary of a quiz attempt before it is submitted. | 2391 | attemptid(int), preflightdata[](name,value) | [{questions[],slot,type,page,questionnumber,number,...}] | no
mod_quiz_get_combined_review_options | Combines the review options from a number of different quiz attempts. | 2397 | quizid(int), userid(int) | [{someoptions[],name,value,name,value,Optional[],...}] | no
mod_quiz_get_edit_grading_page_data | Get the data required to re-render the Quiz grading setup page | 2401 | quizid(int) | {} | yes
mod_quiz_get_overrides | Get quiz overrides | 2402 | quizid(int) | {overrides[],id,quiz,userid,groupid,timeopen,...} | yes
mod_quiz_get_quiz_access_information | Return access information for a given quiz. | 2404 | quizid(int) | [{canattempt,canmanage,canpreview,canreviewmyattempts,canviewreports,Optional[],...}] | no
mod_quiz_get_quiz_feedback_for_grade | Get the feedback text that should be show to a student who got the given grade in the | 2408 | quizid(int), grade(double) | [{feedbacktext,feedbacktextformat,filename,filepath,filesize,fileurl,...}] | no
mod_quiz_get_quiz_required_qtypes | Return the potential question types that would be required for a given quiz. | 2412 | quizid(int) | [{Optional[],item,itemid,warningcode,message}] | no
mod_quiz_get_quizzes_by_courses | Returns a list of quizzes in a provided list of courses, if no list is provided all quizzes that | 2414 | (none) | [{quizzes[],id,coursemodule,course,name,intro,...}] | no
mod_quiz_get_reopen_attempt_confirmation | Verify it is OK to re-open a given quiz attempt, and if so, return a suitable confirmation | 2423 | attemptid(int) | {} | yes
mod_quiz_get_user_attempts | Deprecated | 2425 | quizid(int), userid(int), status(string), includepreviews(int) | [{attempts[],id,quiz,userid,attempt,uniqueid,...}] | no
mod_quiz_get_user_best_grade | Get the best current grade for the given user on a quiz. | 2432 | quizid(int), userid(int) | [{hasgrade,grade,feedbacktext,feedbackformat,filename,filepath,...}] | no
mod_quiz_get_user_quiz_attempts | Return a list of attempts for the given quiz and user. | 2437 | quizid(int), userid(int), status(string), includepreviews(int) | [{attempts[],id,quiz,userid,attempt,uniqueid,...}] | no
mod_quiz_process_attempt | Process responses during an attempt at a quiz and also deals with attempts finishing. | 2444 | attemptid(int), finishattempt(int), timeup(int), data[](name,value), preflightdata[](name,value) | [{state,Optional[],item,itemid,warningcode,message}] | no
mod_quiz_reopen_attempt | Re-open an attempt that is currently in the never submitted state. | 2448 | attemptid(int) | {} | yes
mod_quiz_save_attempt | Processes save requests during the quiz. This function is intended for the quiz auto-save | 2449 | attemptid(int), data[](name,value), preflightdata[](name,value) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_quiz_save_overrides | Update or insert quiz overrides | 2453 | (none) | {ids[]} | yes
mod_quiz_set_question_version | Set the version of question that would be required for a given quiz. | 2455 | slotid(int), newversion(int) | {result} | yes
mod_quiz_start_attempt | Starts a new attempt at a quiz. | 2457 | quizid(int), forcenew(int), preflightdata[](name,value) | [{id,quiz,userid,attempt,uniqueid,layout,...}] | no
mod_quiz_update_filter_condition | Update filter condition for a random question slot. | 2464 | cmid(int), slotid(int), filtercondition(string) | {message} | yes
mod_quiz_update_grade_items | Update quiz grade items. All grade items must belong to the same quiz. | 2466 | quizid(int), quizgradeitems[](id,name) | {} | yes
mod_quiz_update_slots | Update the properties of slots in a quiz. All slots must belong to the same quiz. | 2468 | quizid(int), slots[](id,displaynumber,requireprevious,maxmark,quizgradeitemid) | {} | yes
mod_quiz_view_attempt | Trigger the attempt viewed event. | 2469 | attemptid(int), page(int), preflightdata[](name,value) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_quiz_view_attempt_review | Trigger the attempt reviewed event. | 2473 | attemptid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_quiz_view_attempt_summary | Trigger the attempt summary viewed event. | 2475 | attemptid(int), preflightdata[](name,value) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_quiz_view_quiz | Trigger the course module viewed event and update the module completion status. | 2478 | quizid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_resource_get_resources_by_courses | Returns a list of files in a provided list of courses, if no list is provided all files that the user | 2480 | (none) | [{resources[],id,coursemodule,course,name,intro,...}] | no
mod_resource_view_resource | Simulate the view.php web interface resource: trigger events, completion, etc... | 2487 | resourceid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_scorm_get_scorm_access_information | Return capabilities information for a given scorm. | 2489 | scormid(int) | [{Optional[],item,itemid,warningcode,message,canviewreport,...}] | no
mod_scorm_get_scorm_attempt_count | Return the number of attempts done by a user in the given SCORM. | 2492 | scormid(int), userid(int), ignoremissingcompletion(int) | [{attemptscount,Optional[],item,itemid,warningcode,message}] | no
mod_scorm_get_scorms_by_courses | Returns a list of scorm instances in a provided set of courses, if no courses are provided | 2495 | (none) | [{scorms[],id,coursemodule,course,name,intro,...}] | no
mod_scorm_get_scorm_scoes | Returns a list containing all the scoes data related to the given scorm id | 2503 | scormid(int), organization(string) | [{scoes[],id,scorm,manifest,organization,parent,...}] | no
mod_scorm_get_scorm_sco_tracks | Retrieves SCO tracking data for the given user id and attempt number | 2508 | scoid(int), userid(int), attempt(int) | [{attempt,tracks[],element,value,Optional[],item,...}] | no
mod_scorm_get_scorm_user_data | Retrieves user tracking and SCO data and default SCORM values | 2511 | scormid(int), attempt(int) | [{data[],scoid,userdata[],element,value,element,...}] | no
mod_scorm_insert_scorm_tracks | Saves a scorm tracking record. It will overwrite any existing tracking data for this attempt. | 2515 | scoid(int), attempt(int), tracks[](element,value) | [{trackids[],Optional[],item,itemid,warningcode,message}] | no
mod_scorm_launch_sco | Trigger the SCO launched event. | 2518 | scormid(int), scoid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_scorm_view_scorm | Trigger the course module viewed event. | 2521 | scormid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_url_get_urls_by_courses | Returns a list of urls in a provided list of courses, if no list is provided all urls that the user | 2523 | (none) | [{urls[],id,coursemodule,course,name,intro,...}] | no
mod_url_view_url | Trigger the course module viewed event and update the module completion status. | 2528 | urlid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_wiki_edit_page | Save the contents of a page. | 2531 | pageid(int), content(string), section(string) | [{pageid,Optional[],item,itemid,warningcode,message}] | no
mod_wiki_get_page_contents | Returns the contents of a page. | 2534 | pageid(int) | [{id,wikiid,subwikiid,groupid,userid,title,...}] | no
mod_wiki_get_page_for_editing | Locks and retrieves info of page-section to be edited. | 2538 | pageid(int), section(string), lockonly(int) | [{content,contentformat,version,Optional[],item,itemid,warningcode,message}] | no
mod_wiki_get_subwiki_files | Returns the list of files for a specific subwiki. | 2541 | wikiid(int), groupid(int), userid(int) | [{filename,filepath,filesize,fileurl,timemodified,mimetype,...}] | no
mod_wiki_get_subwiki_pages | Returns the list of pages for a specific subwiki. | 2545 | wikiid(int), groupid(int), userid(int) | [{pages[],id,subwikiid,title,timecreated,timemodified,...}] | no
mod_wiki_get_subwikis | Returns the list of subwikis the user can see in a specific wiki. | 2551 | wikiid(int) | [{subwikis[],id,wikiid,groupid,userid,canedit,...}] | no
mod_wiki_get_wikis_by_courses | Returns a list of wiki instances in a provided set of courses, if no courses are provided then | 2554 | (none) | [{wikis[],id,coursemodule,course,name,intro,...}] | no
mod_wiki_new_page | Create a new page in a subwiki. | 2560 | title(string), content(string), contentformat(string), subwikiid(int), wikiid(int), userid(int), groupid(int) | [{pageid,Optional[],item,itemid,warningcode,message}] | no
mod_wiki_view_page | Trigger the page viewed event and update the module completion status. | 2564 | pageid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_wiki_view_wiki | Trigger the course module viewed event and update the module completion status. | 2567 | wikiid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_workshop_add_submission | Add a new submission to a given workshop. | 2569 | workshopid(int), title(string), content(string), contentformat(int), inlineattachmentsid(int), attachmentsid(int) | [{status,submissionid,Optional[],item,itemid,warningcode,message}] | no
mod_workshop_delete_submission | Deletes the given submission. | 2573 | submissionid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_workshop_evaluate_assessment | Evaluates an assessment (used by teachers for provide feedback to the reviewer). | 2575 | assessmentid(int), feedbacktext(string), feedbackformat(int), weight(int), gradinggradeover(string) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_workshop_evaluate_submission | Evaluates a submission (used by teachers for provide feedback or override the submission | 2580 | submissionid(int), feedbacktext(string), feedbackformat(int), published(int), gradeover(string) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_workshop_get_assessment | Retrieves the given assessment. | 2583 | assessmentid(int) | [{id,submissionid,reviewerid,weight,timecreated,timemodified,...}] | no
mod_workshop_get_assessment_form_definition | Retrieves the assessment form definition. | 2589 | assessmentid(int), mode(string) | [{dimenssionscount,filename,filepath,filesize,fileurl,timemodified,...}] | no
mod_workshop_get_grades | Returns the assessment and submission grade for the given user. | 2595 | workshopid(int), userid(int) | [{assessmentrawgrade,assessmentlongstrgrade,assessmentgradehidden,submissionrawgrade,submissionlongstrgrade,submissiongradehidden,...}] | no
mod_workshop_get_grades_report | Retrieves the assessment grades report. | 2598 | workshopid(int), groupid(int), sortby(string), sortdirection(string), page(int), perpage(int) | [{grades[],userid,submissionid,submissiontitle,submissionmodified,submissiongrade,...}] | no
mod_workshop_get_reviewer_assessments | Retrieves all the assessments reviewed by the given user. | 2605 | workshopid(int), userid(int) | [{assessments[],id,submissionid,reviewerid,weight,timecreated,...}] | no
mod_workshop_get_submission | Retrieves the given submission. | 2612 | submissionid(int) | [{id,workshopid,example,authorid,timecreated,timemodified,...}] | no
mod_workshop_get_submission_assessments | Retrieves all the assessments of the given submission. | 2618 | submissionid(int) | [{assessments[],id,submissionid,reviewerid,weight,timecreated,...}] | no
mod_workshop_get_submissions | Retrieves all the workshop submissions or the one done by the given user (except example | 2624 | workshopid(int), userid(int), groupid(int), page(int), perpage(int) | [{submissions[],id,workshopid,example,authorid,timecreated,...}] | no
mod_workshop_get_user_plan | Return the planner information for the given user. | 2632 | workshopid(int), userid(int) | [{phases[],code,title,active,tasks[],code,...}] | no
mod_workshop_get_workshop_access_information | Return access information for a given workshop. | 2637 | workshopid(int) | [{creatingsubmissionallowed,modifyingsubmissionallowed,assessingallowed,assessingexamplesallowed,examplesassessedbeforesubmission,examplesassessedbeforeassessment,...}] | no
mod_workshop_get_workshops_by_courses | Returns a list of workshops in a provided list of courses, if no list is provided all workshops | 2642 | (none) | [{workshops[],id,course,name,intro,introformat,...}] | no
mod_workshop_update_assessment | Add information to an allocated assessment. | 2652 | assessmentid(int), data[](name,value) | [{status,rawgrade,Optional[],item,itemid,warningcode,message}] | no
mod_workshop_update_submission | Update the given submission. | 2655 | submissionid(int), title(string), content(string), contentformat(int), inlineattachmentsid(int), attachmentsid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_workshop_view_submission | Trigger the submission viewed event. | 2659 | submissionid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
mod_workshop_view_workshop | Trigger the course module viewed event and update the module completion status. | 2661 | workshopid(int) | [{status,Optional[],item,itemid,warningcode,message}] | no
paygw_paypal_create_transaction_complete | Takes care of what needs to be done when a PayPal transaction comes back as complete. | 2664 | component(string), paymentarea(string), itemid(int), orderid(string) | {success,message} | yes
paygw_paypal_get_config_for_js | Returns the configuration settings to be used in js | 2666 | component(string), paymentarea(string), itemid(int) | {clientid,brandname,cost,currency} | yes
qbank_columnsortorder_set_columnbank_order | Sets question columns order in database | 2669 | global(int) | {} | yes
qbank_columnsortorder_set_column_size | Column size | 2670 | sizes(string), global(int) | {} | yes
qbank_columnsortorder_set_hidden_columns | Hidden Columns | 2672 | global(int) | {} | yes
qbank_editquestion_set_status | Update the question status. | 2673 | questionid(int), status(string) | {status,statusname,error} | yes
qbank_managecategories_move_category | Move a question category | 2675 | pagecontextid(int), categoryid(int), targetparentid(int), precedingsiblingid(int) | [{name,action,id,sortorder,parent,context,draghandle}] | yes
qbank_tagquestion_submit_tags_form | Update the question tags. | 2679 | questionid(int), contextid(int), formdata(string) | {status} | yes
qbank_viewquestiontext_set_question_text_format | Sets the preference for displaying and formatting the question text | 2681 | format(int) | {} | yes
quizaccess_seb_validate_quiz_keys | Validate a Safe Exam Browser config key or a browser exam key. | 2682 | cmid(int), url(string), configkey(string), browserexamkey(string) | {configkey,browserexamkey} | yes
report_competency_data_for_report | Load the data for the competency report in a course. | 2685 | courseid(int), userid(int), moduleid(int) | [{courseid,id,email,idnumber,phone1,phone2,...}] | no
report_insights_action_executed | Stores an action executed over a group of predictions. | 2702 | actionname(string) | [{Optional[],item,itemid,warningcode,message}] | yes
tiny_autosave_reset_session | Reset an autosave session | 2704 | contextid(int), pagehash(string), pageinstance(string), elementid(string) | {} | yes
tiny_autosave_resume_session | Resume an autosave session | 2707 | contextid(int), pagehash(string), pageinstance(string), elementid(string), draftid(int) | {drafttext} | yes
tiny_autosave_update_session | Update an autosave session | 2709 | contextid(int), pagehash(string), pageinstance(string), elementid(string), drafttext(string) | {} | yes
tiny_equation_filter | Filter the equation | 2712 | contextid(int), content(string), striptags(int) | {content} | yes
tiny_media_preview | Filters the content | 2715 | contextid(int), content(string) | {content} | yes
tiny_premium_get_api_key | Get the Tiny Premium API key from Moodle | 2716 | contextid(int) | {apikey,usecloud} | yes
tool_admin_presets_delete_preset | Delete a custom preset | 2718 | id(int) | {} | yes
tool_analytics_potential_contexts | Retrieve the list of potential contexts for a model. | 2719 | query(string), modelid(int) | [{id,name}] | yes
tool_behat_get_entity_generator | Get the generator details for an entity | 2721 | entitytype(string) | {} | yes
tool_dataprivacy_approve_data_request | Approve a data request | 2723 | requestid(int) | [{result,Optional[],item,itemid,warningcode,message}] | yes
tool_dataprivacy_bulk_approve_data_requests | Bulk approve data requests | 2725 | (none) | [{result,Optional[],item,itemid,warningcode,message}] | yes
tool_dataprivacy_bulk_deny_data_requests | Bulk deny data requests | 2728 | (none) | [{result,Optional[],item,itemid,warningcode,message}] | yes
tool_dataprivacy_cancel_data_request | Cancel the data request made by the user | 2730 | requestid(int) | [{result,Optional[],item,itemid,warningcode,message}] | yes
tool_dataprivacy_confirm_contexts_for_deletion | Mark the selected expired contexts as confirmed for deletion | 2732 | (none) | [{result,Optional[],item,itemid,warningcode,message}] | yes
tool_dataprivacy_contact_dpo | Contact the site Data Protection Officer(s) | 2735 | message(string) | [{result,Optional[],item,itemid,warningcode,message}] | yes
tool_dataprivacy_create_category_form | Adds a data category | 2737 | jsonformdata(string) | [{name,description,descriptionformat,id,timecreated,timemodified,...}] | yes
tool_dataprivacy_create_data_request | Creates a data request. | 2740 | type(int), comments(string), foruserid(int) | [{datarequestid,Optional[],item,itemid,warningcode,message}] | no
tool_dataprivacy_create_purpose_form | Adds a data purpose | 2743 | jsonformdata(string) | [{name,description,descriptionformat,lawfulbases,sensitivedatareasons,retentionperiod,...}] | yes
tool_dataprivacy_delete_category | Deletes an existing data category | 2747 | id(int) | [{result,Optional[],item,itemid,warningcode,message}] | yes
tool_dataprivacy_delete_purpose | Deletes an existing data purpose | 2749 | id(int) | [{result,Optional[],item,itemid,warningcode,message}] | yes
tool_dataprivacy_deny_data_request | Deny a data request | 2752 | requestid(int) | [{result,Optional[],item,itemid,warningcode,message}] | yes
tool_dataprivacy_get_access_information | Retrieving privacy API access (permissions) information for the current user. | 2754 | (none) | [{cancontactdpo,canmanagedatarequests,cancreatedatadownloadrequest,cancreatedatadeletionrequest,hasongoingdatadownloadrequest,hasongoingdatadeletionrequest,...}] | no
tool_dataprivacy_get_activity_options | Fetches a list of activity options | 2756 | nodefaults(int) | [{options[],name,displayname,Optional[],item,itemid,warningcode,message}] | yes
tool_dataprivacy_get_category_options | Fetches a list of data category options | 2759 | includeinherit(int), includenotset(int) | [{options[],id,name,Optional[],item,itemid,warningcode,message}] | yes
tool_dataprivacy_get_data_request | Fetch the details of a user's data request | 2762 | requestid(int) | [{type,comments,commentsformat,userid,requestedby,status,...}] | yes
tool_dataprivacy_get_data_requests | Gets data request. | 2770 | userid(int), sort(string), limitfrom(int), limitnum(int) | [{type,comments,commentsformat,userid,requestedby,status,...}] | no
tool_dataprivacy_get_purpose_options | Fetches a list of data storage purpose options | 2781 | includeinherit(int), includenotset(int) | [{options[],id,name,Optional[],item,itemid,warningcode,message}] | yes
tool_dataprivacy_get_users | Fetches a list of users | 2784 | query(string) | [{id,fullname,name,value}] | yes
tool_dataprivacy_mark_complete | Mark a user's general enquiry as complete | 2786 | requestid(int) | [{result,Optional[],item,itemid,warningcode,message}] | yes
tool_dataprivacy_set_context_defaults | Updates the default category and purpose for a given context level (and optionally, a | 2789 | contextlevel(int), category(int), purpose(int), activity(string), override(int) | [{result,Optional[],item,itemid,warningcode,message}] | yes
tool_dataprivacy_set_context_form | Sets purpose and category for a specific context | 2792 | jsonformdata(string) | [{result,Optional[],item,itemid,warningcode,message}] | yes
tool_dataprivacy_set_contextlevel_form | Sets purpose and category across a context level | 2794 | jsonformdata(string) | [{result,Optional[],item,itemid,warningcode,message}] | yes
tool_dataprivacy_submit_selected_courses_form | Save list of selected courses for export | 2797 | requestid(int), jsonformdata(string) | [{result,Optional[],item,itemid,warningcode,message}] | yes
tool_dataprivacy_tree_extra_branches | Return branches for the context tree | 2799 | contextid(int), element(string) | [{branches[],text,expandcontextid,expandelement,contextid,contextlevel,...}] | yes
tool_lp_data_for_competencies_manage_page | Load the data for the competencies manage page template | 2804 | competencyframeworkid(int), search(string) | {shortname,idnumber,description,descriptionformat,visible,scaleid,...} | yes
tool_lp_data_for_competency_frameworks_manage_page | Load the data for the competency frameworks manage page template | 2808 | (none) | {competencyframeworks[],shortname,idnumber,description,descriptionformat,visible,...} | yes
tool_lp_data_for_competency_summary | Load competency data for summary template. | 2811 | competencyid(int), includerelated(int), includecourses(int) | [{id,fullname,shortname,idnumber,summary,summaryformat,...}] | yes
tool_lp_data_for_course_competencies_page | Load the data for the course competencies page template. | 2823 | courseid(int), moduleid(int) | [{courseid,pagecontextid,gradableuserid,canmanagecompetencyframeworks,canmanagecoursecompetencies,canconfigurecoursecompetencies,...}] | yes
tool_lp_data_for_plan_page | Load the data for the plan page template. | 2844 | planid(int) | [{name,description,descriptionformat,userid,templateid,origtemplateid,...}] | yes
tool_lp_data_for_plans_page | Load the data for the plans page template | 2863 | userid(int) | {userid,plans[],name,description,descriptionformat,userid,...} | no
tool_lp_data_for_related_competencies_section | Load the data for the related competencies template. | 2873 | competencyid(int) | {relatedcompetencies[],shortname,idnumber,description,descriptionformat,sortorder,...} | yes
tool_lp_data_for_template_competencies_page | Load the data for the template competencies page template. | 2876 | templateid(int) | [{shortname,description,descriptionformat,duedate,visible,contextid,...}] | yes
tool_lp_data_for_templates_manage_page | Load the data for the learning plan templates manage page template | 2893 | (none) | {templates[],shortname,description,descriptionformat,duedate,visible,...} | yes
tool_lp_data_for_user_competency_summary | Load a summary of a user competency. | 2897 | userid(int), competencyid(int) | [{showrelatedcompetencies,cangrade,id,fullname,shortname,idnumber,...}] | yes
tool_lp_data_for_user_competency_summary_in_course | Load a summary of a user competency. | 2921 | userid(int), competencyid(int), courseid(int) | [{showrelatedcompetencies,cangrade,id,fullname,shortname,idnumber,...}] | yes
tool_lp_data_for_user_competency_summary_in_plan | Load a summary of a user competency. | 2956 | competencyid(int), planid(int) | [{showrelatedcompetencies,cangrade,id,fullname,shortname,idnumber,...}] | yes
tool_lp_data_for_user_evidence_list_page | Load the data for the user evidence list page template | 2988 | userid(int) | [{canmanage,userid,pluginbaseurl,evidence[],userid,name,...}] | yes
tool_lp_data_for_user_evidence_page | Load the data for the user evidence page template | 2999 | id(int) | [{userid,name,description,descriptionformat,url,id,...}] | yes
tool_lp_list_courses_using_competency | List the courses using a competency | 3009 | id(int) | [{id,fullname,shortname,idnumber,summary,summaryformat,...}] | yes
tool_lp_search_cohorts | Search for cohorts. This method is deprecated, please call 'core_cohort_search_cohorts' | 3013 | query(string), includes(string), limitfrom(int), limitnum(int) | [{cohorts[],id,name,idnumber,description,descriptionformat,...}] | no
tool_lp_search_users | Search for users. | 3018 | query(string), capability(string), limitfrom(int), limitnum(string) | {users[],id,email,idnumber,phone1,phone2,...} | yes
tool_mobile_call_external_functions | Call multiple external functions and return all responses. | 3022 | requests[](function,arguments,settingraw,settingfilter,settingfileurl,settinglang) | {responses[],error,data,exception} | no
tool_mobile_get_autologin_key | Creates an auto-login key for the current user. Is created only in https sites and is restricted | 3024 | privatetoken(string) | [{key,autologinurl,Optional[],item,itemid,warningcode,message}] | no
tool_mobile_get_config | Returns a list of the site configurations, filtering by section. | 3027 | section(string) | [{name,value,Optional[],item,itemid,warningcode,message}] | no
tool_mobile_get_content | Returns a piece of content to be displayed in the Mobile app. | 3029 | component(string), method(string), args[](name,value) | [{id,html,name,value,filename,filepath,...}] | no
tool_mobile_get_plugins_supporting_mobile | Returns a list of Moodle plugins supporting the mobile app. | 3035 | (none) | [{plugins[],component,version,addon,filehash,filesize,...}] | yes
tool_mobile_get_public_config | Returns a list of the site public settings, those not requiring authentication. | 3038 | (none) | [{wwwroot,httpswwwroot,sitename,guestlogin,rememberusername,authloginviaemail,...}] | yes
tool_mobile_get_tokens_for_qr_login | Returns a WebService token (and private token) for QR login. | 3044 | qrloginkey(string), userid(int) | [{token,privatetoken,Optional[],item,itemid,warningcode,message}] | yes
tool_mobile_validate_subscription_key | Check if the given site subscription key is valid. | 3046 | key(string) | [{validated,Optional[],item,itemid,warningcode,message}] | yes
tool_moodlenet_search_courses | For some given input search for a course that matches | 3049 | searchvalue(string) | {courses[],id,fullname,hidden,viewurl,coursecategory,courseimage} | yes
tool_moodlenet_verify_webfinger | Verify if the passed information resolves into a WebFinger profile URL | 3051 | profileurl(string), course(int), section(int) | {result,message,domain} | yes
tool_policy_get_policy_version | Fetch the details of a policy version | 3053 | versionid(int), behalfid(int) | [{name,versionid,content,Optional[],item,itemid,warningcode,message}] | yes
tool_policy_get_user_acceptances | Get user policies acceptances. | 3056 | userid(int) | [{policyid,versionid,agreementstyle,optional,revision,status,...}] | no
tool_policy_set_acceptances_status | Set the acceptance status (accept or decline only) for the indicated policies for the given | 3061 | userid(int), policies[](versionid,status,note) | [{policyagreed,Optional[],item,itemid,warningcode,message}] | no
tool_policy_submit_accept_on_behalf | Accept policies on behalf of other users | 3064 | jsonformdata(string) | {} | yes
tool_templatelibrary_list_templates | List/search templates by component. | 3065 | component(string), search(string), themename(string) | {} | yes
tool_templatelibrary_load_canonical_template | Load a canonical template by name (not the theme overidden one). | 3067 | component(string), template(string) | {} | yes
tool_usertours_complete_tour | Mark the specified tour as completed for the current user | 3069 | tourid(int), context(int), pageurl(string), stepid(int), stepindex(int) | {} | yes
tool_usertours_fetch_and_start_tour | Fetch the specified tour | 3072 | tourid(int), context(int), pageurl(string) | {name,steps[],title,content,element,placement,...} | yes
tool_usertours_reset_tour | Remove the specified tour | 3076 | tourid(int), context(int), pageurl(string) | {startTour} | yes
tool_usertours_step_shown | Mark the specified step as completed for the current user | 3078 | tourid(int), context(int), pageurl(string), stepid(int), stepindex(int) | {} | yes
tool_xmldb_invoke_move_action | moves element up/down | 3081 | action(string), dir(string), table(string), field(string), key(string), index(string), position(int) | {} | yes
